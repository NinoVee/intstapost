import type { Logger } from "@intstapost/core/logger";
import { AppError, type ScheduledJobName } from "@intstapost/core";
import { agentRuns, and, eq, inArray, lt, mediaAssets, mediaSources, ne, type Database } from "@intstapost/db";
import { cleanupTemporaryMedia, scanSource, type IntakeContext } from "@intstapost/media";

export interface JobDeps {
  ctx: IntakeContext;
  db: Database;
  log: Logger;
  maxUploadBytes: number;
  tempMaxAgeHours: number;
  enqueueAnalysis: (assetId: string, userId: string) => Promise<void>;
}

type RunOutcome = { status: "succeeded" | "skipped"; summary: string; output?: Record<string, unknown> };

/** Wrap a job so every execution is recorded in agent_runs (visible on the dashboard). */
export async function recordRun(db: Database, kind: string, trigger: string, fn: () => Promise<RunOutcome>): Promise<RunOutcome> {
  const [run] = await db.insert(agentRuns).values({ kind, trigger, status: "running", startedAt: new Date() }).returning({ id: agentRuns.id });
  try {
    const r = await fn();
    await db
      .update(agentRuns)
      .set({ status: r.status, output: { summary: r.summary, ...r.output }, finishedAt: new Date() })
      .where(eq(agentRuns.id, run!.id));
    return r;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(agentRuns)
      .set({ status: err instanceof AppError && err.code === "BUDGET_EXCEEDED" ? "budget_exceeded" : "failed", error: message.slice(0, 2000), finishedAt: new Date() })
      .where(eq(agentRuns.id, run!.id));
    throw err;
  }
}

/** DailyMediaScan: pull from every enabled pull-based source, then (re)queue anything not yet analysed. */
export async function dailyMediaScan(d: JobDeps): Promise<RunOutcome> {
  const sources = await d.db.select().from(mediaSources).where(and(eq(mediaSources.enabled, true), ne(mediaSources.kind, "upload")));
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const s of sources) {
    try {
      const r = await scanSource(d.ctx, s.id, d.maxUploadBytes);
      imported += r.newAssetIds.length;
      skipped += r.skipped;
      for (const id of r.newAssetIds) await d.enqueueAnalysis(id, s.userId);
    } catch (err) {
      const msg = `${s.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      d.log.warn({ sourceId: s.id, err }, "source scan failed");
    }
  }
  // Recover assets whose analysis job was lost (e.g. Redis restart).
  const stale = await d.db
    .select({ id: mediaAssets.id, userId: mediaAssets.userId })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.status, ["ingested", "analyzing"]), lt(mediaAssets.updatedAt, new Date(Date.now() - 15 * 60_000))))
    .limit(500);
  for (const a of stale) await d.enqueueAnalysis(a.id, a.userId);

  return {
    status: "succeeded",
    summary: `${sources.length} source(s) scanned, ${imported} new, ${skipped} skipped, ${stale.length} re-queued${errors.length ? `, ${errors.length} error(s)` : ""}`,
    output: { imported, skipped, requeued: stale.length, errors },
  };
}

export async function runScheduledJob(name: ScheduledJobName, trigger: "schedule" | "manual", d: JobDeps): Promise<RunOutcome> {
  return recordRun(d.db, name, trigger, async () => {
    switch (name) {
      case "DailyMediaScan":
        return dailyMediaScan(d);
      case "CleanupTemporaryMedia": {
        const r = await cleanupTemporaryMedia(d.ctx, d.tempMaxAgeHours);
        return { status: "succeeded", summary: `${r.removed} temporary file(s) removed`, output: r };
      }
      case "DailyContentGeneration":
        // Implemented in Phase 7 (content engine). Recorded honestly as skipped.
        return { status: "skipped", summary: "Content engine not built yet (Phase 7)" };
      case "TrendRefresh":
        // Implemented in Phase 13 (optional Trend Engine, official sources only).
        return { status: "skipped", summary: "Trend engine not built yet (Phase 13)" };
    }
  });
}
