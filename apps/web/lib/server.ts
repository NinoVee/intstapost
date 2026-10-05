import "server-only";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getEnv, type Env } from "@intstapost/core/env";
import { getDb, type Database } from "@intstapost/db";
import { createStorage, type StorageDriver } from "@intstapost/media";
import { QUEUES, type AgentJob, type IntakeJob } from "@intstapost/core";

const g = globalThis as unknown as { __storage?: StorageDriver; __intakeQueue?: Queue<IntakeJob>; __agentQueue?: Queue<AgentJob> };

export function env(): Env {
  return getEnv();
}

export function db(): Database {
  return getDb(env().DATABASE_URL);
}

export function storage(): StorageDriver {
  g.__storage ??= createStorage(env());
  return g.__storage;
}

/** BullMQ needs maxRetriesPerRequest: null on its connections (it duplicates this client for workers). */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function intakeQueue(): Queue<IntakeJob> {
  g.__intakeQueue ??= new Queue<IntakeJob>(QUEUES.intake, { connection: createRedis(env().REDIS_URL) });
  return g.__intakeQueue;
}

export function agentQueue(): Queue<AgentJob> {
  g.__agentQueue ??= new Queue<AgentJob>(QUEUES.agent, { connection: createRedis(env().REDIS_URL) });
  return g.__agentQueue;
}
