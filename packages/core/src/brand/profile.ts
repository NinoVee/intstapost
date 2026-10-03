import { z } from "zod";

const level = z.number().int().min(0).max(10);
const intensity = z.number().int().min(0).max(5);

/** Personal Brand Profile (§5). All settings are user-editable. */
export const brandProfileSchema = z.object({
  preferredThemes: z.array(z.string()).default([]),
  themeWeights: z.record(z.string(), z.number().min(0).max(5)).default({}),
  editingIntensity: intensity.default(2),
  /** Ceiling for any edit touching people (identity protection). */
  peopleMaxIntensity: intensity.default(2),
  captionLength: z.enum(["minimal", "short", "medium", "long"]).default("short"),
  captionStyles: z.array(z.enum(["minimal", "confident", "funny", "professional", "inspirational", "luxury", "personal", "reflective"])).default(["minimal", "confident", "personal"]),
  humorLevel: level.default(4),
  professionalismLevel: level.default(6),
  confidenceLevel: level.default(7),
  luxuryLevel: level.default(4),
  frequencies: z
    .object({
      family: level.default(3),
      fitness: level.default(5),
      fashion: level.default(5),
      career: level.default(5),
      travel: level.default(5),
    })
    .default({ family: 3, fitness: 5, fashion: 5, career: 5, travel: 5 }),
  musicGenres: z.array(z.string()).default([]),
  favoriteArtists: z.array(z.string()).default([]),
  visualAesthetics: z.array(z.string()).default(["clean", "natural"]),
  preferredFilters: z.array(z.string()).default([]),
  colorGrading: z.string().default("natural"),
  reelSeconds: z.object({ min: z.number().int().min(3), max: z.number().int().max(90) }).default({ min: 7, max: 20 }),
  storySlides: z.number().int().min(1).max(10).default(5),
  emojiUsage: z.enum(["none", "light", "moderate", "heavy"]).default("light"),
  hashtagCount: z.number().int().min(0).max(30).default(5),
  doNotPost: z.array(z.string()).default([]),
  dailyDraftTarget: z
    .object({ post: z.number().int().min(0).max(5), reel: z.number().int().min(0).max(5), story: z.number().int().min(0).max(5), carousel: z.number().int().min(0).max(5) })
    .default({ post: 1, reel: 1, story: 1, carousel: 0 }),
  /** Privacy: providers may not train on private media unless explicitly enabled. */
  allowExternalTraining: z.boolean().default(false),
});

export type BrandProfileSettings = z.infer<typeof brandProfileSchema>;

export function defaultBrandProfile(): BrandProfileSettings {
  return brandProfileSchema.parse({});
}

export const FEEDBACK_SIGNALS = ["approved", "rejected", "edited", "skipped", "save_for_later"] as const;
export type FeedbackSignal = (typeof FEEDBACK_SIGNALS)[number];

export const REJECTION_REASONS = [
  "too_edited",
  "bad_song",
  "bad_caption",
  "wrong_theme",
  "dont_like_photo",
  "too_personal",
  "not_flattering",
  "repetitive",
  "save_for_later",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];
