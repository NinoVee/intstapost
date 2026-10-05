import "server-only";
import { SCHEDULED_JOBS, type ScheduledJobName } from "@intstapost/core";
import { agentQueue } from "./server";

export const JOB_DESCRIPTIONS: Record<ScheduledJobName, string> = {
  DailyMediaScan: "Import new photos/videos from connected folders and analyse them",
  DailyContentGeneration: "Turn the best new media into drafts for review (content engine, Phase 7)",
  TrendRefresh: "Refresh trend signals from official sources (Phase 13)",
  CleanupTemporaryMedia: "Delete stale temporary files",
};

export function isJobName(v: string): v is ScheduledJobName {
  return (SCHEDULED_JOBS as readonly string[]).includes(v);
}

/** Queue a job now. One pending manual run per job: repeated requests don't pile up. */
export async function startJobNow(name: ScheduledJobName): Promise<{ queued: boolean; jobId: string }> {
  const jobId = `manual-${name}`;
  const q = agentQueue();
  const existing = await q.getJob(jobId);
  const state = existing ? await existing.getState() : null;
  if (state === "waiting" || state === "active" || state === "delayed") return { queued: false, jobId };
  if (existing) await existing.remove().catch(() => undefined);
  await q.add(name, { type: name, trigger: "manual" }, { jobId, removeOnComplete: true, removeOnFail: 100 });
  return { queued: true, jobId };
}
