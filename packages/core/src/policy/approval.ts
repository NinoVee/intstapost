import { sha256Hex, stableStringify } from "../crypto/secrets";
import { PolicyViolationError } from "../errors";

/**
 * AI CREATES. HUMAN APPROVES. (§34)
 *
 * Publishing is only possible when ALL of these hold:
 *   1. The global PUBLISHING_ENABLED kill-switch is on (default off).
 *   2. The publishing target (Instagram account) has publishing enabled by the user (default off).
 *   3. A human approved this draft, and the approval is not revoked.
 *   4. The approval covers the exact current content (any edit after approval invalidates it).
 *   5. The draft is in the `approved` or `scheduled` state.
 * There is no code path that lets the agent mint an approval.
 */

export const DRAFT_STATUSES = [
  "generating",
  "ready_for_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "saved_for_later",
  "archived",
  "failed",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** The parts of a draft whose change must invalidate an approval. */
export interface DraftContent {
  format: string;
  media: Array<{ position: number; editVersionId: string | null; assetId: string; crop?: unknown; trimInMs?: number | null; trimOutMs?: number | null }>;
  caption: string | null;
  hashtags: string[];
  timeline?: unknown;
  storyElements?: unknown;
}

export function computeDraftContentHash(content: DraftContent): string {
  const normalized = { ...content, media: [...content.media].sort((a, b) => a.position - b.position) };
  return sha256Hex(stableStringify(normalized));
}

export interface PublishCheckInput {
  globalPublishingEnabled: boolean;
  target: { publishingEnabled: boolean } | null;
  draft: { id: string; status: DraftStatus; contentHash: string };
  approval: { decision: "approved" | "revoked"; contentHash: string; approvedByUserId: string } | null;
}

export interface PublishCheckResult {
  allowed: boolean;
  reasons: string[];
}

export function evaluatePublish(input: PublishCheckInput): PublishCheckResult {
  const reasons: string[] = [];
  if (!input.globalPublishingEnabled) reasons.push("Publishing is disabled globally (PUBLISHING_ENABLED=false).");
  if (!input.target) reasons.push("No publishing target is connected.");
  else if (!input.target.publishingEnabled) reasons.push("Publishing is not enabled for this account.");
  if (!input.approval) reasons.push("Draft has not been approved by a human.");
  else if (input.approval.decision !== "approved") reasons.push("Approval was revoked.");
  else if (input.approval.contentHash !== input.draft.contentHash)
    reasons.push("Draft changed after approval; it must be re-approved.");
  if (input.draft.status !== "approved" && input.draft.status !== "scheduled")
    reasons.push(`Draft status is "${input.draft.status}", not approved.`);
  return { allowed: reasons.length === 0, reasons };
}

declare const approvalBrand: unique symbol;
/** Proof that `evaluatePublish` passed. Publishing targets require it. */
export type PublishAuthorization = Readonly<{ draftId: string; contentHash: string }> & { readonly [approvalBrand]: true };

export function authorizePublish(input: PublishCheckInput): PublishAuthorization {
  const result = evaluatePublish(input);
  if (!result.allowed) throw new PolicyViolationError("Publishing not authorized", result.reasons);
  return Object.freeze({ draftId: input.draft.id, contentHash: input.draft.contentHash }) as PublishAuthorization;
}

/** Legal status transitions; the agent may only move drafts into generating/ready/failed. */
const TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  generating: ["ready_for_review", "failed"],
  ready_for_review: ["approved", "rejected", "saved_for_later", "archived", "generating"],
  approved: ["scheduled", "published", "ready_for_review", "archived"],
  scheduled: ["published", "approved", "ready_for_review", "archived"],
  published: ["archived"],
  rejected: ["ready_for_review", "archived", "generating"],
  saved_for_later: ["ready_for_review", "archived", "generating"],
  archived: ["ready_for_review"],
  failed: ["generating", "archived"],
};

export type Actor = "user" | "agent" | "system";
/** Saving for later is reversible and never publishes, so an agent may do it on the user's behalf. */
const AGENT_ALLOWED_TARGETS: DraftStatus[] = ["generating", "ready_for_review", "failed", "saved_for_later"];

export function assertTransition(from: DraftStatus, to: DraftStatus, actor: Actor): void {
  if (!TRANSITIONS[from].includes(to)) throw new PolicyViolationError(`Illegal draft transition ${from} → ${to}`);
  if (actor !== "user" && !AGENT_ALLOWED_TARGETS.includes(to))
    throw new PolicyViolationError(`Only a human can move a draft to "${to}".`);
}
