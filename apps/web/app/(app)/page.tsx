import Link from "next/link";
import { agentRuns, and, contentDrafts, contentThemes, count, desc, draftMedia, eq, gte, inArray, mediaAssets, sql } from "@intstapost/db";
import { DraftCard, type DraftCardData } from "@/components/DraftCard";
import { requireUser } from "@/lib/auth";
import { greeting } from "@/lib/format";
import { mediaUrl } from "@/lib/media-urls";
import { db, env } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const d = db();
  const since = new Date(Date.now() - 86400_000);

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
    })
    .from(contentDrafts)
    .leftJoin(contentThemes, eq(contentThemes.id, contentDrafts.primaryThemeId))
    .where(and(eq(contentDrafts.userId, user.id), inArray(contentDrafts.status, ["ready_for_review", "generating", "approved"])))
    .orderBy(desc(contentDrafts.createdAt))
    .limit(12);

  const covers = drafts.length
    ? await d
        .select({ draftId: draftMedia.draftId, position: draftMedia.position, preview: mediaAssets.previewStorageKey })
        .from(draftMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, draftMedia.assetId))
        .where(inArray(draftMedia.draftId, drafts.map((x) => x.id)))
    : [];

  const cards: DraftCardData[] = drafts.map((x) => {
    const media = covers.filter((c) => c.draftId === x.id).sort((a, b) => a.position - b.position);
    return { ...x, coverUrl: mediaUrl(media[0]?.preview, user.id), slides: media.length };
  });

  const [stats] = await d
    .select({
      total: count(),
      today: sql<number>`count(*) filter (where ${mediaAssets.createdAt} >= ${since.toISOString()}::timestamptz)`,
      analyzed: sql<number>`count(*) filter (where ${mediaAssets.status} = 'analyzed')`,
      pending: sql<number>`count(*) filter (where ${mediaAssets.status} in ('ingested','analyzing'))`,
      unusable: sql<number>`count(*) filter (where ${mediaAssets.status} = 'unusable')`,
      duplicates: sql<number>`count(*) filter (where ${mediaAssets.isClusterRepresentative} = false)`,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, user.id));

  const runs = await d
    .select()
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, new Date(Date.now() - 7 * 86400_000)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(6);

  const publishing = env().PUBLISHING_ENABLED;
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: user.timezone }).format(new Date());

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>
            {greeting(user.timezone).toUpperCase()}, {user.displayName.split(" ")[0]}
          </h1>
        </div>
        <Link href="/library" className="btn primary">
          Add media
        </Link>
      </div>

      <div className="banner" role="status">
        <strong>AI CREATES. YOU APPROVE.</strong>
        <span className={`pill ${publishing ? "warn" : "ok"}`}>
          <span className="dot" /> Auto-publishing {publishing ? "allowed only after your approval" : "off"}
        </span>
        <span className="muted small">Every draft is an internal draft. Instagram's API has no native-draft endpoint.</span>
      </div>

      <h2>Today&apos;s content</h2>
      {cards.length ? (
        <div className="grid grid-drafts">
          {cards.map((c) => (
            <DraftCard key={c.id} d={c} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>No drafts waiting for review</p>
          <p style={{ margin: "6px 0 0" }} className="small">
            Your media is being organised. The content engine (Phase 7) will turn it into Posts, Reels, Stories and Carousels here.
          </p>
        </div>
      )}

      <h2>Media pipeline</h2>
      <div className="grid grid-stats">
        {[
          ["In library", stats?.total ?? 0],
          ["Added in last 24h", stats?.today ?? 0],
          ["Analysed", stats?.analyzed ?? 0],
          ["Awaiting analysis", stats?.pending ?? 0],
          ["Near-duplicates skipped", stats?.duplicates ?? 0],
          ["Unusable", stats?.unusable ?? 0],
        ].map(([label, value]) => (
          <div className="card stat" key={label as string}>
            <div className="value">{Number(value)}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      <h2>Recent agent runs</h2>
      {runs.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>When</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.kind}</td>
                  <td>
                    <span className={`pill ${r.status === "succeeded" ? "ok" : r.status === "failed" ? "danger" : ""}`}>{r.status}</span>
                  </td>
                  <td className="muted">{r.createdAt.toLocaleString("en-US", { timeZone: user.timezone, dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="muted small">{r.error ?? (typeof r.output.summary === "string" ? r.output.summary : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">No runs yet. The worker records every scheduled job here.</p>
      )}
    </>
  );
}
