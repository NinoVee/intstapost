import { DEFAULT_THEMES, DEFAULT_WEEKLY_RHYTHM, defaultBrandProfile } from "@intstapost/core";
import type { Database } from "./client";
import { brandProfiles, contentThemes, mediaSources, schedules } from "./schema";

export const DEFAULT_SCHEDULES = [
  { jobName: "DailyMediaScan", cron: "0 6 * * *" },
  { jobName: "DailyContentGeneration", cron: "30 6 * * *" },
  { jobName: "TrendRefresh", cron: "0 5 * * 1" },
  { jobName: "CleanupTemporaryMedia", cron: "15 * * * *" },
] as const;

/** Idempotently create a user's themes, brand profile and upload source. */
export async function seedUserDefaults(db: Database, userId: string, timezone = "UTC"): Promise<void> {
  const weekdayFor = (slug: string) =>
    Object.entries(DEFAULT_WEEKLY_RHYTHM)
      .filter(([, slugs]) => slugs.includes(slug))
      .map(([d]) => Number(d));

  await db
    .insert(contentThemes)
    .values(
      DEFAULT_THEMES.map((t) => ({
        userId,
        slug: t.slug,
        name: t.name,
        musicMoods: t.musicMoods,
        sensitive: t.sensitive ?? false,
        preferredWeekdays: weekdayFor(t.slug),
      })),
    )
    .onConflictDoNothing();

  await db.insert(brandProfiles).values({ userId, settings: defaultBrandProfile() }).onConflictDoNothing();

  await db
    .insert(mediaSources)
    .values({ userId, kind: "upload", name: "Uploads", config: {} })
    .onConflictDoNothing();

  await db
    .insert(schedules)
    .values(DEFAULT_SCHEDULES.map((s) => ({ ...s, timezone })))
    .onConflictDoNothing();
}
