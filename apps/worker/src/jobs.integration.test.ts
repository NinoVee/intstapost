import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { getLogger } from "@intstapost/core/logger";
import { agentRuns, desc, eq, mediaAssets, mediaSources, users, type Database } from "@intstapost/db";
import { createTestDatabase } from "@intstapost/db/testing";
import { LocalStorage } from "@intstapost/media";
import { runScheduledJob, type JobDeps } from "./jobs";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("scheduled jobs (postgres)", () => {
  let db: Database;
  let cleanup: () => Promise<void>;
  let deps: JobDeps;
  let importRoot: string;
  const enqueued: string[] = [];

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDatabase(url!));
    const root = await mkdtemp(path.join(os.tmpdir(), "worker-"));
    importRoot = path.join(root, "import");
    await mkdir(path.join(importRoot, "camera"), { recursive: true });
    const [u] = await db.insert(users).values({ email: "w@example.com", passwordHash: "x", displayName: "W" }).returning();
    await db.insert(mediaSources).values({ userId: u!.id, kind: "local_folder", name: "Camera export", config: { path: path.join(importRoot, "camera") } });
    deps = {
      ctx: { db, storage: new LocalStorage(path.join(root, "media")), tempRoot: path.join(root, "tmp"), importRoots: [importRoot] },
      db,
      log: getLogger({ test: true }),
      maxUploadBytes: 50e6,
      tempMaxAgeHours: 24,
      enqueueAnalysis: async (id) => {
        enqueued.push(id);
      },
    };
  });
  afterAll(async () => cleanup?.());

  it("DailyMediaScan imports new files from an allow-listed folder, once", async () => {
    const img = (c: string) => sharp({ create: { width: 800, height: 1000, channels: 3, background: c } }).jpeg().toBuffer();
    await writeFile(path.join(importRoot, "camera", "a.jpg"), await img("#a33"));
    await writeFile(path.join(importRoot, "camera", "b.jpg"), await img("#3a3"));
    await writeFile(path.join(importRoot, "camera", "notes.txt"), "ignore me");

    const first = await runScheduledJob("DailyMediaScan", "manual", deps);
    expect(first.status).toBe("succeeded");
    expect(first.output?.imported).toBe(2);
    expect(enqueued).toHaveLength(2);

    const second = await runScheduledJob("DailyMediaScan", "manual", deps);
    expect(second.output?.imported).toBe(0);
    expect(await db.select().from(mediaAssets)).toHaveLength(2);

    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.kind, "DailyMediaScan")).orderBy(desc(agentRuns.createdAt)).limit(1);
    expect(run?.status).toBe("succeeded");
  });

  it("records unbuilt jobs as skipped rather than pretending", async () => {
    const r = await runScheduledJob("DailyContentGeneration", "schedule", deps);
    expect(r.status).toBe("skipped");
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.kind, "DailyContentGeneration"));
    expect(run?.status).toBe("skipped");
  });

  it("a folder outside MEDIA_IMPORT_ROOTS is reported, not read", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "outside-"));
    const [u] = await db.select().from(users).limit(1);
    await db.insert(mediaSources).values({ userId: u!.id, kind: "local_folder", name: "Sneaky", config: { path: outside } });
    const r = await runScheduledJob("DailyMediaScan", "manual", deps);
    expect((r.output?.errors as string[]).join()).toMatch(/not inside MEDIA_IMPORT_ROOTS/);
  });
});
