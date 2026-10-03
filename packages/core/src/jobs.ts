/** Queue + job contracts shared by the web app (producer) and worker (consumer). */
export const QUEUES = {
  intake: "media-intake",
  agent: "agent",
} as const;

export type IntakeJob = { type: "analyze_asset"; assetId: string; userId: string };

export const SCHEDULED_JOBS = ["DailyMediaScan", "DailyContentGeneration", "TrendRefresh", "CleanupTemporaryMedia"] as const;
export type ScheduledJobName = (typeof SCHEDULED_JOBS)[number];

export type AgentJob = { type: ScheduledJobName; trigger: "schedule" | "manual"; userId?: string };
