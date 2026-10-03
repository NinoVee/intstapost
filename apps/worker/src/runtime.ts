import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES, type AgentJob, type IntakeJob } from "@intstapost/core";
import { getEnv } from "@intstapost/core/env";
import { getLogger } from "@intstapost/core/logger";
import { getDb } from "@intstapost/db";
import { createStorage } from "@intstapost/media";
import type { JobDeps } from "./jobs";

/** BullMQ needs maxRetriesPerRequest: null on its connections (it duplicates this client for workers). */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createRuntime() {
  const env = getEnv();
  const log = getLogger({ service: "worker" });
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(env);
  const connection = createRedis(env.REDIS_URL);
  const intakeQueue = new Queue<IntakeJob>(QUEUES.intake, { connection });
  const agentQueue = new Queue<AgentJob>(QUEUES.agent, { connection });

  const deps: JobDeps = {
    ctx: { db, storage, tempRoot: env.TEMP_ROOT, importRoots: env.MEDIA_IMPORT_ROOTS },
    db,
    log,
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    tempMaxAgeHours: env.TEMP_FILE_MAX_AGE_HOURS,
    enqueueAnalysis: async (assetId, userId) => {
      await intakeQueue.add(
        "analyze",
        { type: "analyze_asset", assetId, userId },
        { jobId: `analyze-${assetId}`, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 },
      );
    },
  };
  return { env, log, db, storage, connection, intakeQueue, agentQueue, deps };
}
