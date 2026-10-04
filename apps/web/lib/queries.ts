import "server-only";
import {
  agentRuns,
  and,
  contentDrafts,
  contentThemes,
  count,
  desc,
  draftMedia,
  eq,
  gte,
  inArray,
  lt,
  mediaAnalysis,
  mediaAssets,
  mediaSources,
  ne,
  sql,
  type SQL,
} from "@intstapost/db";
import { mediaUrl } from "./media-urls";
import { db } from "./server";

/* Shared by the web pages and the JSON API used by the Apple app. */

export interface DraftSummary {
  id: string;
  format: string;
  status: string;
  theme: string | null;
  qualityScore: number | null;
  aiModified: boolean;
  containsChildren: boolean;
  containsFamily: boolean;
  coverUrl: string | null;
  slides: number;
  createdAt: Date;
}

export async function listActiveDrafts(userId: string, limit = 12): Promise<DraftSummary[]> {
  const d = db();
  const drafts = await d
    .select({
      id: contentDrafts.id,
      format: contentDrafts.format,
      status: contentDrafts.status,
      theme: contentThemes.name,
      qualityScore: contentDrafts.qualityScore,
      aiModified: contentDrafts.aiModified,
      containsChildren: contentDrafts.containsChildren,
      containsFamily: contentDrafts.containsFamily,
      createdAt: contentDrafts.createdAt,
    })
    .from(contentDrafts)
    .leftJoin(contentThemes, eq(contentThemes.id, contentDrafts.primaryThemeId))
    .where(and(eq(contentDrafts.userId, userId), inArray(contentDrafts.status, ["ready_for_review", "generating", "approved"])))
    .orderBy(desc(contentDrafts.createdAt))
    .limit(limit);
  if (!drafts.length) return [];
  const covers = await d
    .select({ draftId: draftMedia.draftId, position: draftMedia.position, preview: mediaAssets.previewStorageKey })
    .from(draftMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, draftMedia.assetId))
    .where(inArray(draftMedia.draftId, drafts.map((x) => x.id)));
  return drafts.map((x) => {
    const media = covers.filter((c) => c.draftId === x.id).sort((a, b) => a.position - b.position);
    return { ...x, coverUrl: mediaUrl(media[0]?.preview, userId), slides: media.length };
  });
}

export interface PipelineStats {
  total: number;
  today: number;
  analyzed: number;
  pending: number;
  unusable: number;
  duplicates: number;
}

export async function pipelineStats(userId: string): Promise<PipelineStats> {
  const since = new Date(Date.now() - 86400_000);
  const [s] = await db()
    .select({
      total: count(),
      today: sql<number>`count(*) filter (where ${mediaAssets.createdAt} >= ${since.toISOString()}::timestamptz)`,
      analyzed: sql<number>`count(*) filter (where ${mediaAssets.status} = 'analyzed')`,
      pending: sql<number>`count(*) filter (where ${mediaAssets.status} in ('ingested','analyzing'))`,
      unusable: sql<number>`count(*) filter (where ${mediaAssets.status} = 'unusable')`,
      duplicates: sql<number>`count(*) filter (where ${mediaAssets.isClusterRepresentative} = false)`,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId));
  const n = (v: unknown) => Number(v ?? 0);
  return { total: n(s?.total), today: n(s?.today), analyzed: n(s?.analyzed), pending: n(s?.pending), unusable: n(s?.unusable), duplicates: n(s?.duplicates) };
}

export async function recentAgentRuns(limit = 6) {
  return db()
    .select()
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, new Date(Date.now() - 7 * 86400_000)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);
}

export const MEDIA_FILTERS = {
  all: "All",
  best: "Best picks",
  duplicates: "Near-duplicates",
  unusable: "Unusable",
  excluded: "Never use",
} as const;
export type MediaFilter = keyof typeof MEDIA_FILTERS;

export function parseMediaFilter(v: string | null | undefined): MediaFilter {
  return v && v in MEDIA_FILTERS ? (v as MediaFilter) : "all";
}

export interface MediaSummary {
  id: string;
  kind: "image" | "video";
  status: string;
  previewUrl: string | null;
  durationMs: number | null;
  isRepresentative: boolean;
  clusterId: string | null;
  excluded: boolean;
  technicalScore: number | null;
  isBlurry: boolean | null;
  createdAt: Date;
}

export async function listMedia(userId: string, filter: MediaFilter, opts: { limit?: number; before?: Date } = {}): Promise<MediaSummary[]> {
  const conds: SQL[] = [eq(mediaAssets.userId, userId)];
  if (filter === "best") conds.push(eq(mediaAssets.status, "analyzed"), eq(mediaAssets.isClusterRepresentative, true), eq(mediaAssets.excluded, false));
  if (filter === "duplicates") conds.push(eq(mediaAssets.isClusterRepresentative, false));
  if (filter === "unusable") conds.push(eq(mediaAssets.status, "unusable"));
  if (filter === "excluded") conds.push(eq(mediaAssets.excluded, true));
  if (opts.before) conds.push(lt(mediaAssets.createdAt, opts.before));

  const rows = await db()
    .select({
      id: mediaAssets.id,
      kind: mediaAssets.kind,
      status: mediaAssets.status,
      preview: mediaAssets.previewStorageKey,
      durationMs: mediaAssets.durationMs,
      isRepresentative: mediaAssets.isClusterRepresentative,
      clusterId: mediaAssets.duplicateClusterId,
      excluded: mediaAssets.excluded,
      technicalScore: mediaAnalysis.technicalScore,
      isBlurry: mediaAnalysis.isBlurry,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .leftJoin(mediaAnalysis, and(eq(mediaAnalysis.assetId, mediaAssets.id), eq(mediaAnalysis.stage, "deterministic")))
    .where(and(...conds))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(opts.limit ?? 120, 200));
  return rows.map(({ preview, ...r }) => ({ ...r, previewUrl: mediaUrl(preview, userId) }));
}

export const SCORE_KEYS = [
  "technicalScore",
  "compositionScore",
  "personalRelevanceScore",
  "instagramPotentialScore",
  "themeMatchScore",
  "uniquenessScore",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export async function getAssetDetail(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db()
    .select({ asset: mediaAssets, source: mediaSources.name })
    .from(mediaAssets)
    .leftJoin(mediaSources, eq(mediaSources.id, mediaAssets.sourceId))
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId)))
    .limit(1);
  if (!row) return null;
  const a = row.asset;
  const analyses = await db().select().from(mediaAnalysis).where(eq(mediaAnalysis.assetId, a.id));
  const det = analyses.find((x) => x.stage === "deterministic") ?? null;
  const ai = analyses.find((x) => x.stage === "ai") ?? null;
  const similarRows = a.duplicateClusterId
    ? await db()
        .select({ id: mediaAssets.id, preview: mediaAssets.previewStorageKey, isRepresentative: mediaAssets.isClusterRepresentative })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.duplicateClusterId, a.duplicateClusterId), ne(mediaAssets.id, a.id), eq(mediaAssets.userId, userId)))
        .limit(24)
    : [];
  const scores = Object.fromEntries(SCORE_KEYS.map((k) => [k, (ai?.[k] ?? det?.[k] ?? null) as number | null])) as Record<ScoreKey, number | null>;
  return {
    asset: a,
    source: row.source,
    deterministic: det,
    scores,
    previewUrl: mediaUrl(a.previewStorageKey, userId),
    originalUrl: mediaUrl(a.originalStorageKey, userId),
    similar: similarRows.map((s) => ({ id: s.id, isRepresentative: s.isRepresentative, previewUrl: mediaUrl(s.preview, userId) })),
  };
}
