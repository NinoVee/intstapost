/**
 * Editing intensity scale (§8).
 *   0 = Original
 *   1 = Color correction only
 *   2 = Light enhancement
 *   3 = Moderate enhancement
 *   4 = Strong enhancement
 *   5 = Creative transformation
 */
export const EDIT_INTENSITY = {
  ORIGINAL: 0,
  COLOR_ONLY: 1,
  LIGHT: 2,
  MODERATE: 3,
  STRONG: 4,
  CREATIVE: 5,
} as const;

export type EditIntensity = 0 | 1 | 2 | 3 | 4 | 5;

export const EDIT_INTENSITY_LABELS: Record<EditIntensity, string> = {
  0: "Original",
  1: "Color correction only",
  2: "Light enhancement",
  3: "Moderate enhancement",
  4: "Strong enhancement",
  5: "Creative transformation",
};

/** Default ceiling for edits touching people when the user has not asked for more. */
export const DEFAULT_PEOPLE_MAX_INTENSITY: EditIntensity = 2;
/** Children: colour/light only unless the user explicitly overrides per edit. */
export const CHILD_MAX_INTENSITY: EditIntensity = 1;

export function clampIntensity(n: number): EditIntensity {
  return Math.max(0, Math.min(5, Math.round(n))) as EditIntensity;
}
