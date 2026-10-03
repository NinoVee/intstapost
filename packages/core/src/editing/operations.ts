import type { EditIntensity } from "./intensity";

export type EditRegion = "global" | "face" | "body" | "clothing" | "background";

/** Labels that must be shown on a draft when certain AI edits were applied. */
export type DisclosureLabel =
  | "ai_modified" // any generative edit
  | "ai_modified_clothing" // §9 major clothing replacement
  | "ai_body_adjustment" // §8 body edits
  | "creative_ai_scene"; // §10 edits that could imply a place/event that didn't happen

export interface EditOperationSpec {
  /** Minimum intensity level required to run this operation. */
  minIntensity: EditIntensity;
  region: EditRegion;
  /** Needs a generative model (vs. deterministic FFmpeg/Sharp). */
  generative: boolean;
  disclosure?: DisclosureLabel;
  /** Never allowed on media containing children, even with overrides. */
  forbiddenOnChildren?: boolean;
  description: string;
}

/**
 * Catalogue of every edit operation the system knows about. Editors declare which
 * of these they support; the guard reasons about them deterministically.
 */
const OPERATIONS = {
  // Global / deterministic
  crop: { minIntensity: 1, region: "global", generative: false, description: "Crop / aspect-ratio framing" },
  reframe: { minIntensity: 1, region: "global", generative: false, description: "Reframe subject for 9:16, 4:5, 1:1" },
  perspective_correct: { minIntensity: 1, region: "global", generative: false, description: "Straighten / fix perspective" },
  exposure: { minIntensity: 1, region: "global", generative: false, description: "Exposure correction" },
  white_balance: { minIntensity: 1, region: "global", generative: false, description: "White balance" },
  color_correct: { minIntensity: 1, region: "global", generative: false, description: "Colour correction" },
  color_grade: { minIntensity: 2, region: "global", generative: false, description: "Stylistic colour grade" },
  denoise: { minIntensity: 1, region: "global", generative: false, description: "Noise reduction" },
  sharpen: { minIntensity: 1, region: "global", generative: false, description: "Sharpening" },
  stabilize: { minIntensity: 1, region: "global", generative: false, description: "Video stabilisation" },
  trim: { minIntensity: 0, region: "global", generative: false, description: "Trim video" },
  speed_ramp: { minIntensity: 2, region: "global", generative: false, description: "Slow motion / speed ramp" },
  relight: { minIntensity: 2, region: "global", generative: true, disclosure: "ai_modified", description: "AI relighting" },
  upscale: { minIntensity: 2, region: "global", generative: true, description: "AI upscale" },

  // Face — subtle only
  blemish_cleanup: { minIntensity: 2, region: "face", generative: false, description: "Minor blemish cleanup" },
  skin_cleanup: { minIntensity: 2, region: "face", generative: false, description: "Mild skin cleanup" },

  // Body — conservative
  posture_correct: { minIntensity: 3, region: "body", generative: true, disclosure: "ai_body_adjustment", forbiddenOnChildren: true, description: "Posture correction" },
  body_slim_slight: { minIntensity: 3, region: "body", generative: true, disclosure: "ai_body_adjustment", forbiddenOnChildren: true, description: "Slight slimming" },
  silhouette_cleanup: { minIntensity: 3, region: "body", generative: true, disclosure: "ai_body_adjustment", forbiddenOnChildren: true, description: "Minor silhouette cleanup" },

  // Clothing
  clothing_wrinkle_remove: { minIntensity: 2, region: "clothing", generative: true, description: "Remove wrinkles" },
  clothing_recolor: { minIntensity: 3, region: "clothing", generative: true, disclosure: "ai_modified", description: "Change clothing colour" },
  clothing_fit: { minIntensity: 3, region: "clothing", generative: true, disclosure: "ai_modified_clothing", description: "Improve clothing fit" },
  clothing_replace: { minIntensity: 4, region: "clothing", generative: true, disclosure: "ai_modified_clothing", description: "Replace clothing" },
  accessory_add: { minIntensity: 4, region: "clothing", generative: true, disclosure: "ai_modified_clothing", description: "Add accessories" },
  logo_remove: { minIntensity: 2, region: "clothing", generative: true, description: "Remove distracting logos" },

  // Background — may be edited more aggressively
  background_blur: { minIntensity: 2, region: "background", generative: false, description: "Depth-of-field / background blur" },
  remove_strangers: { minIntensity: 2, region: "background", generative: true, disclosure: "ai_modified", description: "Remove strangers" },
  remove_clutter: { minIntensity: 2, region: "background", generative: true, disclosure: "ai_modified", description: "Remove clutter / objects" },
  sky_replace: { minIntensity: 3, region: "background", generative: true, disclosure: "ai_modified", description: "Change sky" },
  background_extend: { minIntensity: 3, region: "background", generative: true, disclosure: "ai_modified", description: "Extend background (outpaint)" },
  background_replace: { minIntensity: 4, region: "background", generative: true, disclosure: "creative_ai_scene", description: "Replace background" },
  object_add: { minIntensity: 4, region: "background", generative: true, disclosure: "creative_ai_scene", description: "Add objects" },
  cinematic_style: { minIntensity: 5, region: "global", generative: true, disclosure: "creative_ai_scene", description: "Creative cinematic transformation" },
} as const satisfies Record<string, EditOperationSpec>;

export type EditOperation = keyof typeof OPERATIONS;
export const EDIT_OPERATIONS: Readonly<Record<EditOperation, EditOperationSpec>> = OPERATIONS;

export function isEditOperation(op: string): op is EditOperation {
  return Object.hasOwn(EDIT_OPERATIONS, op);
}
