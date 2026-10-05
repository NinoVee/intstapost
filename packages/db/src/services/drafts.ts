import {
  assertTransition,
  computeDraftContentHash,
  PolicyViolationError,
  AppError,
  type DraftContent,
  type DraftStatus,
  type RejectionReason,
} from "@intstapost/core";
import { and, asc, desc, eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Database } from "../client";
import { approvals, captions, contentDrafts, draftMedia, feedback, hashtags } from "../schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Assemble the publishable content of a draft (what an approval binds to). */
export async function loadDraftContent(db: Database | Tx, draftId: string): Promise<DraftContent> {
  const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).limit(1);
  if (!draft) throw new AppError("Draft not found", "NOT_FOUND", 404);
  const media = await db.select().from(draftMedia).where(eq(draftMedia.draftId, draftId)).orderBy(asc(draftMedia.position));
  const [caption] = await db.select().from(captions).where(and(eq(captions.draftId, draftId), eq(captions.selected, true))).limit(1);
  const tags = await db.select().from(hashtags).where(and(eq(hashtags.draftId, draftId), eq(hashtags.selected, true)));
  return {
    format: draft.format,
    media: media.map((m) => ({
      position: m.position,
      assetId: m.assetId,
      editVersionId: m.editVersionId,
      crop: m.crop ?? null,
      trimInMs: m.trimInMs,
      trimOutMs: m.trimOutMs,
    })),
    caption: caption ? (caption.editedText ?? caption.text) : null,
    hashtags: tags.map((t) => t.tag).sort(),
    timeline: draft.timeline ?? null,
    storyElements: draft.storyElements ?? null,
  };
}

async function getOwnedDraft(tx: Tx, userId: string, draftId: string) {
  const [draft] = await tx
    .select()
    .from(contentDrafts)
    .where(and(eq(contentDrafts.id, draftId), eq(contentDrafts.userId, userId)))
    .for("update")
    .limit(1);
  if (!draft) throw new AppError("Draft not found", "NOT_FOUND", 404);
  return draft;
}

async function snapshot(tx: Tx, draftId: string) {
  const [d] = await tx.select().from(contentDrafts).where(eq(contentDrafts.id, draftId));
  return { format: d?.format, primaryThemeId: d?.primaryThemeId, aiModified: d?.aiModified };
}

/**
 * Human approval. Binds to the exact content hash; any later change to media,
 * caption, hashtags or timeline invalidates it (see evaluatePublish).
 * Approving does NOT publish.
 */
export async function approveDraft(db: Database, userId: string, draftId: string, ip?: string | null) {
  return db.transaction(async (tx) => {
    const draft = await getOwnedDraft(tx, userId, draftId);
    assertTransition(draft.status as DraftStatus, "approved", "user");
    const contentHash = computeDraftContentHash(await loadDraftContent(tx, draftId));
    await tx.update(contentDrafts).set({ status: "approved", contentHash }).where(eq(contentDrafts.id, draftId));
    await tx.insert(approvals).values({ draftId, userId, decision: "approved", contentHash });
    await tx.insert(feedback).values({ userId, draftId, signal: "approved", context: await snapshot(tx, draftId) });
    await audit(tx, { userId, actor: "user", action: "draft.approved", entityType: "content_draft", entityId: draftId, metadata: { contentHash }, ipAddress: ip });
    return { contentHash };
  });
}

export async function rejectDraft(db: Database, userId: string, draftId: string, reasons: RejectionReason[], comment?: string, ip?: string | null) {
  return db.transaction(async (tx) => {
    const draft = await getOwnedDraft(tx, userId, draftId);
    assertTransition(draft.status as DraftStatus, "rejected", "user");
    await tx.update(contentDrafts).set({ status: "rejected" }).where(eq(contentDrafts.id, draftId));
    await tx.insert(feedback).values({ userId, draftId, signal: "rejected", reasons, comment, context: await snapshot(tx, draftId) });
    await audit(tx, { userId, actor: "user", action: "draft.rejected", entityType: "content_draft", entityId: draftId, metadata: { reasons }, ipAddress: ip });
  });
}

/** Reversible and never publishes, so an AI agent may do this on the user's behalf (actor "agent"). */
export async function saveDraftForLater(
  db: Database,
  userId: string,
  draftId: string,
  ip?: string | null,
  by: { actor: "user" | "agent"; agentKeyId?: string } = { actor: "user" },
) {
  return db.transaction(async (tx) => {
    const draft = await getOwnedDraft(tx, userId, draftId);
    assertTransition(draft.status as DraftStatus, "saved_for_later", by.actor);
    await tx.update(contentDrafts).set({ status: "saved_for_later" }).where(eq(contentDrafts.id, draftId));
    // Only a human decision is a taste signal; an agent's request is recorded but marked as such.
    await tx.insert(feedback).values({ userId, draftId, signal: "save_for_later", context: { ...(await snapshot(tx, draftId)), via: by.actor } });
    await audit(tx, { userId, actor: by.actor, action: "draft.saved_for_later", entityType: "content_draft", entityId: draftId, metadata: by.agentKeyId ? { agentKeyId: by.agentKeyId } : {}, ipAddress: ip });
  });
}

/** Withdraw an approval; the draft goes back to review. */
export async function revokeApproval(db: Database, userId: string, draftId: string, ip?: string | null) {
  return db.transaction(async (tx) => {
    const draft = await getOwnedDraft(tx, userId, draftId);
    if (draft.status !== "approved" && draft.status !== "scheduled") throw new PolicyViolationError("Draft is not approved");
    assertTransition(draft.status as DraftStatus, "ready_for_review", "user");
    await tx.update(contentDrafts).set({ status: "ready_for_review" }).where(eq(contentDrafts.id, draftId));
    await tx.insert(approvals).values({ draftId, userId, decision: "revoked", contentHash: draft.contentHash ?? "" });
    await audit(tx, { userId, actor: "user", action: "draft.approval_revoked", entityType: "content_draft", entityId: draftId, ipAddress: ip });
  });
}

export async function latestApproval(db: Database, draftId: string) {
  const [a] = await db.select().from(approvals).where(eq(approvals.draftId, draftId)).orderBy(desc(approvals.createdAt)).limit(1);
  return a ?? null;
}
