import {
  CHILD_MAX_INTENSITY,
  DEFAULT_PEOPLE_MAX_INTENSITY,
  clampIntensity,
  type EditIntensity,
} from "../editing/intensity";
import { EDIT_OPERATIONS, type DisclosureLabel, type EditOperation } from "../editing/operations";

/**
 * Identity Preservation Guard (§7–§10, §22).
 *
 * Every edit request — prompt and structured operations — passes through here
 * before it can be sent to any image/video model. Identity preservation has
 * priority over aesthetics. The guard is deterministic and conservative: when a
 * rule fires it blocks rather than guesses.
 *
 * This is the pre-flight half of identity protection. The post-flight half
 * (comparing face embeddings of original vs. edited output) belongs to the
 * Quality-Control agent.
 */

export interface EditSubjects {
  hasPeople: boolean;
  hasChildren: boolean;
}

export interface EditRequestInput {
  assetId: string;
  operations: EditOperation[];
  /** Free-text instructions destined for a generative model (may be empty). */
  prompt?: string;
  requestedIntensity: EditIntensity;
  subjects: EditSubjects;
  /** Ceiling for people edits from the brand profile (default 2). */
  peopleMaxIntensity?: EditIntensity;
  /**
   * Set only when the human explicitly asked for this specific edit to go
   * beyond the defaults (e.g. "make this stronger"). Never set by the agent.
   */
  explicitUserOverride?: { intensity: EditIntensity; allowCreativeScene?: boolean };
}

export type ViolationSeverity = "block" | "constrain";

export interface GuardViolation {
  rule: string;
  severity: ViolationSeverity;
  message: string;
  match?: string;
}

declare const guardedBrand: unique symbol;

/** An edit request that has passed the guard. Only `IdentityPreservationGuard` can mint one. */
export type GuardedEditRequest = Readonly<{
  assetId: string;
  operations: readonly EditOperation[];
  prompt: string;
  negativePrompt: string;
  effectiveIntensity: EditIntensity;
  disclosureLabels: readonly DisclosureLabel[];
  subjects: EditSubjects;
}> & { readonly [guardedBrand]: true };

export type GuardResult =
  | { allowed: true; request: GuardedEditRequest; violations: GuardViolation[]; droppedOperations: EditOperation[] }
  | { allowed: false; violations: GuardViolation[] };

interface PatternRule {
  rule: string;
  message: string;
  patterns: RegExp[];
}

const SUBJ = "(?:the |my |his |her |their |our |your |this |that |a |an )?(?:person'?s? |man'?s? |woman'?s? |kid'?s? |child'?s? |guy'?s? |girl'?s? )?";

/** Always blocked when people are present — no override can unlock these. */
const IDENTITY_RULES: PatternRule[] = [
  {
    rule: "face_swap",
    message: "Face replacement / swapping is never allowed.",
    patterns: [/face[\s-]*swap/, /swap\s+\S*\s*faces?/, new RegExp(`(replace|substitute|switch)\\s+${SUBJ}face`), /deep\s*fake/, /face\s*(replacement|transplant)/],
  },
  {
    rule: "facial_geometry",
    message: "Facial geometry (eyes, nose, jaw, chin, lips, cheekbones, face shape) must not be changed.",
    patterns: [
      new RegExp(
        `(change|alter|reshape|modify|morph|resize|shrink|enlarge|narrow|widen|slim|thin|sharpen|define|lift|contour|fix|correct)\\s+${SUBJ}(face shape|facial (structure|features|geometry)|nose|jaw ?line|jaw|chin|lips|cheek ?bones?|eye ?shape|eyes|eyelids|forehead|ears|brow ?bone)`,
      ),
      /(bigger|larger|smaller|wider|narrower|thinner|fuller|slimmer|sharper|stronger|defined|chiselled|chiseled)\s+(eyes|nose|jaw ?line|jaw|chin|lips|cheek ?bones|face)/,
      new RegExp(
        `${SUBJ}(nose|jaw ?line|jaw|chin|lips|cheek ?bones?|eyes|eyelids|forehead|ears|face)\\s+(look\\s+)?(bigger|larger|smaller|wider|narrower|thinner|fuller|slimmer|sharper|more defined|longer|shorter|rounder|pointier)`,
      ),
      /(v[\s-]?shape[d]?|slim|thin|narrow)\s+face/,
      /face[\s-]*(slim|lift|reshape|sculpt|contour)/,
      /(nose|jaw|chin|lip)\s*(job|filler|reshap\w*|contour\w*|slim\w*)/,
      /plastic surgery/,
    ],
  },
  {
    rule: "identity_change",
    message: "Edits must not change who a person is.",
    patterns: [
      /(different|new|another|other)\s+(person|identity|face|ethnicity|race)/,
      new RegExp(`(make|turn)\\s+${SUBJ}(me|him|her|them|us|person|face)?\\s*(look\\s+)?like\\s+(a\\s+)?(celebrity|model|someone|somebody|another|different)`),
      /change\s+(\S+\s+)?(ethnicity|race|skin\s*(tone|colou?r))/,
      /(lighten|darken|whiten)\s+(\S+\s+)?skin/,
    ],
  },
  {
    rule: "age_change",
    message: "Artificial aging / de-aging is not allowed.",
    patterns: [
      /de-?\s?age/,
      /age\s+(me|him|her|them|up|down)/,
      /(look|appear|make\s+\S+)\s+(much\s+|a lot\s+|\d+\s+years\s+)?(younger|older)/,
      /\d+\s+years\s+(younger|older)/,
      /(remove|erase)\s+(all\s+)?(the\s+)?wrinkles\s+(from|on)\s+(\S+\s+)?face/,
    ],
  },
];

/** Major body changes. Blocked unless the human explicitly overrides to level ≥4; never on children. */
const MAJOR_BODY_RULES: PatternRule[] = [
  {
    rule: "major_body_change",
    message: "Major body changes are not made automatically.",
    patterns: [
      /(lose|remove|drop|take off)\s+\d+\s*(lbs?|pounds|kg|kilos)/,
      /(much|significantly|dramatically|way|a lot|extremely|very)\s+(thinner|slimmer|skinnier|bigger|more muscular|leaner|curvier)/,
      /(add|give\s+\S+)\s+(an?\s+)?(abs|six[\s-]?pack|eight[\s-]?pack|muscles|biceps|pecs)/,
      /(bigger|larger|enlarge|smaller|reduce|lift)\s+(breasts?|bust|butt|glutes|bum|chest|hips|thighs)/,
      /(make\s+\S+\s+)?(taller|shorter)\b/,
      /body\s*(reshape|transform\w*|swap)/,
      /(change|alter)\s+(\S+\s+)?body\s*(shape|type)/,
    ],
  },
];

/** Implies an event / place / relationship / achievement that didn't happen (§10). */
const MISLEADING_RULES: PatternRule[] = [
  {
    rule: "misleading_scene",
    message: "This edit could imply something that didn't happen; it needs explicit creative mode and an AI label.",
    patterns: [
      /(put|place|move|teleport)\s+(me|us|him|her|them|\S+)\s+(in|at|on|into)\s+/,
      /(add|insert)\s+(a\s+|an\s+|some\s+)?(person|people|celebrity|girlfriend|boyfriend|wife|husband|partner|friend|crowd|fans)/,
      /(add|insert)\s+(a\s+|an\s+)?(lamborghini|ferrari|rolls|bentley|supercar|yacht|private jet|trophy|award|medal|cash|money|stack of)/,
      /(replace|change|swap)\s+(the\s+)?(background|location|scene|setting)\s+(to|with|for)\s+/,
    ],
  },
];

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
}

function matchRules(text: string, rules: PatternRule[], severity: ViolationSeverity): GuardViolation[] {
  const out: GuardViolation[] = [];
  for (const r of rules) {
    for (const p of r.patterns) {
      const m = text.match(p);
      if (m) {
        out.push({ rule: r.rule, severity, message: r.message, match: m[0] });
        break;
      }
    }
  }
  return out;
}

export const IDENTITY_PRESERVATION_CLAUSE =
  "Preserve the exact identity of every person: do not change facial geometry, eye shape, nose, jaw, " +
  "face shape, skin tone, apparent age, or body proportions. Faces may only receive lighting, exposure, " +
  "white-balance, colour, noise and very subtle cleanup adjustments. Every person must remain clearly " +
  "recognisable as themselves.";

export const IDENTITY_NEGATIVE_PROMPT =
  "face swap, different person, altered facial features, reshaped nose, reshaped jaw, changed eye shape, " +
  "face slimming, aged, de-aged, changed skin tone, plastic skin, airbrushed face, uncanny face, " +
  "extra fingers, missing fingers, distorted hands, warped body";

export class IdentityPreservationGuard {
  check(input: EditRequestInput): GuardResult {
    const violations: GuardViolation[] = [];
    const text = normalize(input.prompt ?? "");
    const { hasPeople, hasChildren } = input.subjects;
    const override = input.explicitUserOverride;

    // 1. Identity rules — absolute when people may be present.
    if (hasPeople || hasChildren) {
      violations.push(...matchRules(text, IDENTITY_RULES, "block"));
    } else {
      // Even without detected people, a face-swap style prompt is never legitimate.
      violations.push(...matchRules(text, IDENTITY_RULES.filter((r) => r.rule === "face_swap"), "block"));
    }

    // 2. Major body changes.
    const body = matchRules(text, MAJOR_BODY_RULES, "block");
    if (body.length > 0) {
      if (hasChildren) {
        violations.push(...body.map((v) => ({ ...v, message: "Body edits are never applied to children." })));
      } else if (!override || override.intensity < 4) {
        violations.push(...body);
      }
    }

    // 3. Misleading scenes.
    const misleading = matchRules(text, MISLEADING_RULES, "block");
    const creativeAllowed = override?.allowCreativeScene === true;
    if (misleading.length > 0 && !creativeAllowed) violations.push(...misleading);

    if (violations.some((v) => v.severity === "block")) return { allowed: false, violations };

    // 4. Resolve effective intensity.
    let effective = input.requestedIntensity;
    if (hasPeople || hasChildren) {
      const ceiling = hasChildren ? CHILD_MAX_INTENSITY : (input.peopleMaxIntensity ?? DEFAULT_PEOPLE_MAX_INTENSITY);
      const allowed = override ? Math.max(ceiling, override.intensity) : ceiling;
      if (effective > allowed) {
        violations.push({
          rule: "intensity_ceiling",
          severity: "constrain",
          message: `Intensity reduced from ${effective} to ${allowed} because the media contains ${hasChildren ? "children" : "people"}.`,
        });
        effective = clampIntensity(allowed);
      }
    }
    if (effective === 5 && !creativeAllowed) {
      violations.push({ rule: "creative_requires_override", severity: "constrain", message: "Level 5 creative transformation requires an explicit request; reduced to 4." });
      effective = 4;
    }

    // 5. Filter operations by intensity / subject rules.
    const kept: EditOperation[] = [];
    const dropped: EditOperation[] = [];
    const labels = new Set<DisclosureLabel>();
    for (const op of input.operations) {
      const spec = EDIT_OPERATIONS[op];
      const forbiddenChild = hasChildren && spec.forbiddenOnChildren === true;
      const sceneBlocked = spec.disclosure === "creative_ai_scene" && !creativeAllowed && (hasPeople || hasChildren);
      if (spec.minIntensity > effective || forbiddenChild || sceneBlocked) {
        dropped.push(op);
        violations.push({
          rule: "operation_dropped",
          severity: "constrain",
          message: forbiddenChild
            ? `${op} is never applied to media with children.`
            : sceneBlocked
              ? `${op} would imply a different scene with real people in it; needs explicit creative mode.`
              : `${op} needs intensity ≥ ${spec.minIntensity} (effective ${effective}).`,
        });
        continue;
      }
      kept.push(op);
      if (spec.disclosure) labels.add(spec.disclosure);
      if (spec.generative) labels.add("ai_modified");
    }
    if (misleading.length > 0 && creativeAllowed) labels.add("creative_ai_scene");
    if (body.length > 0 && override && override.intensity >= 4) labels.add("ai_body_adjustment");
    // Free-text prompts always go to a generative model.
    if (text.length > 0) labels.add("ai_modified");

    const peoplePresent = hasPeople || hasChildren;
    const prompt = [input.prompt?.trim(), peoplePresent ? IDENTITY_PRESERVATION_CLAUSE : ""].filter(Boolean).join("\n\n");

    const request = Object.freeze({
      assetId: input.assetId,
      operations: Object.freeze([...kept]),
      prompt,
      negativePrompt: peoplePresent ? IDENTITY_NEGATIVE_PROMPT : "",
      effectiveIntensity: effective,
      disclosureLabels: Object.freeze([...labels]),
      subjects: { ...input.subjects },
    }) as GuardedEditRequest;

    return { allowed: true, request, violations, droppedOperations: dropped };
  }
}
