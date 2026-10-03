import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, eq, mediaAnalysis, mediaAssets, seedUserDefaults, users, type Database } from "@intstapost/db";
import { createTestDatabase } from "@intstapost/db/testing";
import { LocalStorage } from "../storage/local";
import { blur, makeSharpImage, nearDuplicate } from "../test/fixtures";
import { analyzeAsset, ingestMedia, type IntakeContext } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("intake pipeline (postgres)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let ctx: IntakeContext;
  let userId: string;

  beforeAll(async () => {
    ({ db, cleanup: close } = await createTestDatabase(url!));
    const root = await mkdtemp(path.join(os.tmpdir(), "intake-"));
    ctx = { db, storage: new LocalStorage(path.join(root, "media")), tempRoot: path.join(root, "tmp") };
    const [u] = await db.insert(users).values({ email: "owner@example.com", passwordHash: "x", displayName: "Owner" }).returning();
    userId = u!.id;
    await seedUserDefaults(db, userId);
  });

  afterAll(async () => {
    await close?.();
  });

  it("ingests, deduplicates exact copies, and analyses", async () => {
    const bytes = await makeSharpImage(11);
    const first = await ingestMedia(ctx, { userId, sourceId: null, filename: "IMG_1.jpg", bytes, maxBytes: 50e6 });
    expect(first.duplicate).toBe(false);
    const again = await ingestMedia(ctx, { userId, sourceId: null, filename: "copy.jpg", bytes, maxBytes: 50e6 });
    expect(again).toEqual({ assetId: first.assetId, duplicate: true, needsAnalysis: true });

    const result = await analyzeAsset(ctx, first.assetId);
    expect(result.status).toBe("analyzed");
    expect((await ingestMedia(ctx, { userId, sourceId: null, bytes, maxBytes: 50e6 })).needsAnalysis).toBe(false);
    expect(result.isBlurry).toBe(false);

    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, first.assetId));
    expect(asset!.width).toBe(1200);
    expect(asset!.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(await ctx.storage.exists(asset!.previewStorageKey!)).toBe(true);
    const analyses = await db.select().from(mediaAnalysis).where(eq(mediaAnalysis.assetId, first.assetId));
    expect(analyses).toHaveLength(1);
    expect(analyses[0]!.technicalScore).toBeGreaterThan(0);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, first.assetId));
    expect(logs.map((l) => l.action)).toContain("media.ingested");
  });

  it("clusters near-duplicates and keeps the sharper one as representative", async () => {
    const base = await makeSharpImage(21);
    const a = await ingestMedia(ctx, { userId, sourceId: null, bytes: base, maxBytes: 50e6 });
    const b = await ingestMedia(ctx, { userId, sourceId: null, bytes: await nearDuplicate(base), maxBytes: 50e6 });
    const c = await ingestMedia(ctx, { userId, sourceId: null, bytes: await blur(base, 2), maxBytes: 50e6 });
    const ra = await analyzeAsset(ctx, a.assetId);
    const rb = await analyzeAsset(ctx, b.assetId);
    const rc = await analyzeAsset(ctx, c.assetId);
    expect(rb.clusterId).not.toBeNull();
    expect(rc.clusterId).toBe(rb.clusterId);
    expect(ra.technicalScore).toBeGreaterThan(rc.technicalScore);
  });

  it("rejects unsupported and oversized files", async () => {
    await expect(ingestMedia(ctx, { userId, sourceId: null, bytes: Buffer.from("%PDF-1.4 hello"), maxBytes: 50e6 })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA" });
    await expect(ingestMedia(ctx, { userId, sourceId: null, bytes: await makeSharpImage(3), maxBytes: 10 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("database refuses to repoint an original", async () => {
    const [any] = await db.select().from(mediaAssets).limit(1);
    await expect(db.update(mediaAssets).set({ originalStorageKey: "originals/x" }).where(eq(mediaAssets.id, any!.id))).rejects.toThrow();
  });
});
