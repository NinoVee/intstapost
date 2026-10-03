import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, sha256Hex } from "@intstapost/core";
import { and, audit, desc, eq, inArray, isNotNull, mediaAnalysis, mediaAssets, mediaSources, type Database } from "@intstapost/db";
import { detectMediaType } from "../analysis/detect";
import { analyzeImage, ANALYZER_VERSION } from "../analysis/image";
import { analyzeVideo } from "../analysis/video";
import { technicalScore, usability } from "../analysis/scoring";
import { assignCluster } from "../analysis/dedupe";
import { ObjectExistsError, type StorageDriver } from "../storage/types";
import { originalKey, previewKey } from "../storage/keys";
import { createMediaProvider } from "../providers/registry";

export interface IntakeContext {
  db: Database;
  storage: StorageDriver;
  tempRoot: string;
  importRoots?: string[];
}

export interface IngestInput {
  userId: string;
  sourceId: string | null;
  externalId?: string | null;
  filename?: string | null;
  bytes: Buffer;
  maxBytes: number;
  actor?: "user" | "agent" | "system";
  ipAddress?: string | null;
}

export interface IngestResult {
  assetId: string;
  duplicate: boolean;
  /** True for new assets, and for duplicates whose earlier analysis never completed. */
  needsAnalysis: boolean;
}

const needsAnalysis = (status: string) => status === "ingested" || status === "failed";

/**
 * Stores an original exactly once (content-addressed, write-once) and records it.
 * Exact duplicates (same sha256) are detected before anything else happens.
 */
export async function ingestMedia(ctx: IntakeContext, input: IngestInput): Promise<IngestResult> {
  if (input.bytes.length === 0) throw new AppError("Empty file", "EMPTY_FILE", 400);
  if (input.bytes.length > input.maxBytes) throw new AppError("File too large", "FILE_TOO_LARGE", 413);

  const type = await detectMediaType(input.bytes);
  if (!type) throw new AppError("Unsupported media type", "UNSUPPORTED_MEDIA", 415);

  const sha256 = sha256Hex(input.bytes);
  const existing = await ctx.db
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, input.userId), eq(mediaAssets.sha256, sha256)))
    .limit(1);
  if (existing[0]) return { assetId: existing[0].id, duplicate: true, needsAnalysis: needsAnalysis(existing[0].status) };

  const key = originalKey(input.userId, sha256, type.ext);
  try {
    await ctx.storage.putImmutable(key, input.bytes, type.mimeType);
  } catch (err) {
    if (!(err instanceof ObjectExistsError)) throw err; // identical bytes already stored
  }

  const inserted = await ctx.db
    .insert(mediaAssets)
    .values({
      userId: input.userId,
      sourceId: input.sourceId,
      externalId: input.externalId ?? null,
      kind: type.kind,
      mimeType: type.mimeType,
      originalFilename: input.filename ? path.basename(input.filename).slice(0, 255) : null,
      originalStorageKey: key,
      sha256,
      sizeBytes: input.bytes.length,
    })
    .onConflictDoNothing()
    .returning({ id: mediaAssets.id });

  if (!inserted[0]) {
    const raced = await ctx.db
      .select({ id: mediaAssets.id, status: mediaAssets.status })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.userId, input.userId), eq(mediaAssets.sha256, sha256)))
      .limit(1);
    if (!raced[0]) throw new AppError("Asset conflict", "ASSET_CONFLICT", 409);
    return { assetId: raced[0].id, duplicate: true, needsAnalysis: needsAnalysis(raced[0].status) };
  }

  await audit(ctx.db, {
    userId: input.userId,
    actor: input.actor ?? "user",
    action: "media.ingested",
    entityType: "media_asset",
    entityId: inserted[0].id,
    metadata: { kind: type.kind, mimeType: type.mimeType, sizeBytes: input.bytes.length, sourceId: input.sourceId },
    ipAddress: input.ipAddress,
  });
  return { assetId: inserted[0].id, duplicate: false, needsAnalysis: true };
}

export interface AnalyzeResult {
  assetId: string;
  status: "analyzed" | "unusable";
  technicalScore: number;
  isBlurry: boolean;
  clusterId: string | null;
  isRepresentative: boolean;
}

async function withTempFile<T>(root: string, bytes: Buffer, ext: string, fn: (p: string) => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Runtime temp path (not a build-time asset) — excluded from bundler file tracing.
  const file = path.join(/*turbopackIgnore: true*/ path.resolve(root), `${randomBytes(12).toString("hex")}.${ext}`);
  await writeFile(file, bytes, { mode: 0o600 });
  try {
    return await fn(file);
  } finally {
    await rm(file, { force: true });
  }
}

/**
 * Stage 1 analysis — local, deterministic, free (§20): metadata, quality
 * metrics, perceptual hash, near-duplicate clustering. Runs before any paid AI.
 */
export async function analyzeAsset(ctx: IntakeContext, assetId: string): Promise<AnalyzeResult> {
  const [asset] = await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset) throw new AppError("Asset not found", "NOT_FOUND", 404);

  await ctx.db.update(mediaAssets).set({ status: "analyzing" }).where(eq(mediaAssets.id, assetId));
  try {
    const bytes = await ctx.storage.get(asset.originalStorageKey);
    let width: number;
    let height: number;
    let durationMs: number | null = null;
    let capturedAt: Date | null = null;
    let lat: number | null = null;
    let lon: number | null = null;
    let metadata: Record<string, unknown>;
    let analysis;

    if (asset.kind === "image") {
      analysis = await analyzeImage(bytes, asset.mimeType);
      ({ width, height, capturedAt } = analysis);
      lat = analysis.approxLatitude;
      lon = analysis.approxLongitude;
      metadata = analysis.metadata;
    } else {
      const ext = asset.originalStorageKey.split(".").pop() ?? "mp4";
      analysis = await withTempFile(ctx.tempRoot, bytes, ext, (p) => analyzeVideo(p));
      ({ width, height, durationMs, capturedAt } = analysis.probe);
      const { fps, videoCodec, audioCodec, rotation } = analysis.probe;
      metadata = { fps, videoCodec, audioCodec, rotation };
    }

    const tech = technicalScore(analysis, width, height);
    const use = usability(analysis, width, height);
    const pKey = previewKey(asset.userId, asset.id);
    await ctx.storage.put(pKey, analysis.previewJpeg, "image/jpeg");

    // Near-duplicate clustering against this user's other analysed assets of the same kind.
    const candidates = await ctx.db
      .select({
        id: mediaAssets.id,
        phash: mediaAssets.phash,
        clusterId: mediaAssets.duplicateClusterId,
        technicalScore: mediaAnalysis.technicalScore,
      })
      .from(mediaAssets)
      .leftJoin(mediaAnalysis, and(eq(mediaAnalysis.assetId, mediaAssets.id), eq(mediaAnalysis.stage, "deterministic")))
      .where(and(eq(mediaAssets.userId, asset.userId), eq(mediaAssets.kind, asset.kind), isNotNull(mediaAssets.phash)))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(2000);
    const cluster = assignCluster(
      { id: asset.id, phash: analysis.phash, technicalScore: tech },
      candidates.map((c) => ({ id: c.id, phash: c.phash!, clusterId: c.clusterId, technicalScore: c.technicalScore ?? 0 })),
      () => randomUUID(),
    );
    const status = use.unusable ? "unusable" : "analyzed";

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(mediaAssets)
        .set({
          width,
          height,
          durationMs,
          capturedAt,
          approxLatitude: lat,
          approxLongitude: lon,
          metadata: { ...metadata, unusableReasons: use.reasons },
          phash: analysis.phash,
          previewStorageKey: pKey,
          status,
          duplicateClusterId: cluster.clusterId,
          isClusterRepresentative: cluster.representatives.has(asset.id),
        })
        .where(eq(mediaAssets.id, asset.id));

      if (cluster.clusterId) {
        const others = cluster.members.filter((m) => m !== asset.id);
        const reps = others.filter((m) => cluster.representatives.has(m));
        const nonReps = others.filter((m) => !cluster.representatives.has(m));
        if (reps.length) await tx.update(mediaAssets).set({ duplicateClusterId: cluster.clusterId, isClusterRepresentative: true }).where(inArray(mediaAssets.id, reps));
        if (nonReps.length) await tx.update(mediaAssets).set({ duplicateClusterId: cluster.clusterId, isClusterRepresentative: false }).where(inArray(mediaAssets.id, nonReps));
      }

      await tx.delete(mediaAnalysis).where(and(eq(mediaAnalysis.assetId, asset.id), eq(mediaAnalysis.stage, "deterministic")));
      await tx.insert(mediaAnalysis).values({
        assetId: asset.id,
        stage: "deterministic",
        analyzer: "sharp+ffmpeg",
        analyzerVersion: ANALYZER_VERSION,
        sharpness: analysis.sharpness,
        brightness: analysis.brightness,
        contrast: analysis.contrast,
        clippedHighlights: analysis.clippedHighlights,
        clippedShadows: analysis.clippedShadows,
        isBlurry: use.isBlurry,
        technicalScore: tech,
        uniquenessScore: cluster.clusterId ? Math.max(10, 100 - 15 * (cluster.members.length - 1)) : 100,
      });
    });

    return {
      assetId,
      status,
      technicalScore: tech,
      isBlurry: use.isBlurry,
      clusterId: cluster.clusterId,
      isRepresentative: cluster.representatives.has(asset.id),
    };
  } catch (err) {
    await ctx.db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, assetId));
    throw err;
  }
}

/** Pull new media from a configured source (DailyMediaScan). Returns new asset IDs to analyse. */
export async function scanSource(ctx: IntakeContext, sourceId: string, maxBytes: number): Promise<{ newAssetIds: string[]; skipped: number }> {
  const [source] = await ctx.db.select().from(mediaSources).where(eq(mediaSources.id, sourceId)).limit(1);
  if (!source || !source.enabled) return { newAssetIds: [], skipped: 0 };
  const provider = await createMediaProvider(source, ctx.importRoots ?? []);
  const { items, nextCursor } = await provider.listNew(source.cursor);

  const newAssetIds: string[] = [];
  let skipped = 0;
  for (const item of items) {
    const seen = await ctx.db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.sourceId, source.id), eq(mediaAssets.externalId, item.externalId)))
      .limit(1);
    if (seen[0]) {
      skipped++;
      continue;
    }
    try {
      const bytes = await provider.read(item);
      const r = await ingestMedia(ctx, {
        userId: source.userId,
        sourceId: source.id,
        externalId: item.externalId,
        filename: item.filename,
        bytes,
        maxBytes,
        actor: "agent",
      });
      if (r.duplicate) skipped++;
      else newAssetIds.push(r.assetId);
    } catch (err) {
      if (err instanceof AppError && ["UNSUPPORTED_MEDIA", "FILE_TOO_LARGE", "EMPTY_FILE"].includes(err.code)) {
        skipped++;
        continue;
      }
      throw err;
    }
  }
  await ctx.db.update(mediaSources).set({ cursor: nextCursor, lastScannedAt: new Date() }).where(eq(mediaSources.id, source.id));
  return { newAssetIds, skipped };
}

/** CleanupTemporaryMedia: removes stale temp objects and local temp files. Never touches originals. */
export async function cleanupTemporaryMedia(ctx: IntakeContext, maxAgeHours: number): Promise<{ removed: number }> {
  const cutoff = Date.now() - maxAgeHours * 3600_000;
  let removed = 0;
  for (const obj of await ctx.storage.list("tmp/")) {
    if (obj.modifiedAt.getTime() < cutoff) {
      await ctx.storage.delete(obj.key);
      removed++;
    }
  }
  try {
    for (const name of await readdir(ctx.tempRoot)) {
      const full = path.join(ctx.tempRoot, name);
      if ((await stat(full)).mtimeMs < cutoff) {
        await rm(full, { force: true, recursive: true });
        removed++;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { removed };
}
