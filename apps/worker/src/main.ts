import { Worker } from "bullmq";
import { QUEUES, SCHEDULED_JOBS, type AgentJob, type IntakeJob, type ScheduledJobName } from "@intstapost/core";
import { closeDb, schedules } from "@intstapost/db";
import { analyzeAsset } from "@intstapost/media";
import { runScheduledJob } from "./jobs";
import { createRuntime } from "./runtime";

const rt = createRuntime();
const { log, deps } = rt;

/** Sync BullMQ job schedulers with the `schedules` table (configurable cron + timezone). */
async function syncSchedules() {
  const rows = await rt.db.select().from(schedules);
  const existing = await rt.agentQueue.getJobSchedulers();
  for (const name of SCHEDULED_JOBS) {
    const row = rows.find((r) => r.jobName === name);
    if (row?.enabled) {
      await rt.agentQueue.upsertJobScheduler(name, { pattern: row.cron, tz: row.timezone }, { name, data: { type: name, trigger: "schedule" } });
      log.info({ job: name, cron: row.cron, tz: row.timezone }, "schedule registered");
    } else if (existing.some((s) => s.key === name || s.id === name)) {
      await rt.agentQueue.removeJobScheduler(name);
      log.info({ job: name }, "schedule removed");
    }
  }
}

const intakeWorker = new Worker<IntakeJob>(
  QUEUES.intake,
  async (job) => {
    const r = await analyzeAsset(deps.ctx, job.data.assetId);
    log.info({ assetId: r.assetId, status: r.status, tech: r.technicalScore, cluster: r.clusterId }, "asset analysed");
    return r;
  },
  { connection: rt.connection, concurrency: 2 },
);

const agentWorker = new Worker<AgentJob>(
  QUEUES.agent,
  async (job) => {
    const name = job.data.type as ScheduledJobName;
    const r = await runScheduledJob(name, job.data.trigger, deps);
    log.info({ job: name, ...r }, "agent job finished");
    return r;
  },
  { connection: rt.connection, concurrency: 1 },
);

for (const w of [intakeWorker, agentWorker]) {
  w.on("failed", (job, err) => log.error({ queue: w.name, jobId: job?.id, err: err.message }, "job failed"));
}

await syncSchedules();
log.info("worker started");

async function shutdown(signal: string) {
  log.info({ signal }, "shutting down");
  await Promise.allSettled([intakeWorker.close(), agentWorker.close()]);
  await Promise.allSettled([rt.intakeQueue.close(), rt.agentQueue.close()]);
  rt.connection.disconnect();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
