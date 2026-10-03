/** Run a scheduled job immediately: pnpm --filter @intstapost/worker run-job DailyMediaScan */
import { SCHEDULED_JOBS, type ScheduledJobName } from "@intstapost/core";
import { closeDb } from "@intstapost/db";
import { runScheduledJob } from "./jobs";
import { createRuntime } from "./runtime";

const name = process.argv[2] as ScheduledJobName;
if (!SCHEDULED_JOBS.includes(name)) {
  console.error(`Usage: run-job <${SCHEDULED_JOBS.join("|")}>`);
  process.exit(1);
}
const rt = createRuntime();
try {
  const r = await runScheduledJob(name, "manual", rt.deps);
  console.log(`${name}: ${r.status} — ${r.summary}`);
} finally {
  await Promise.allSettled([rt.intakeQueue.close(), rt.agentQueue.close()]);
  rt.connection.disconnect();
  await closeDb();
}
