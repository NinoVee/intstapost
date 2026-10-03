import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeDraftContentHash, evaluatePublish } from "@intstapost/core";
import type { Database } from "../client";
import { createTestDatabase } from "../testing";
import { captions, contentDrafts, draftMedia, feedback, mediaAssets, users } from "../schema";
import { and, eq } from "drizzle-orm";
import { approveDraft, latestApproval, loadDraftContent, rejectDraft, revokeApproval } from "./drafts";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("draft decisions (postgres)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;
  let otherUserId: string;

  async function makeDraft(status: "ready_for_review" | "generating" = "ready_for_review") {
    const [asset] = await db
      .insert(mediaAssets)
      .values({ userId, kind: "image", mimeType: "image/jpeg", originalStorageKey: `originals/${userId}/${crypto.randomUUID()}.jpg`, sha256: crypto.randomUUID(), sizeBytes: 1 })
      .returning();
    const [draft] = await db.insert(contentDrafts).values({ userId, format: "post", status }).returning();
    await db.insert(draftMedia).values({ draftId: draft!.id, position: 0, role: "cover", assetId: asset!.id });
    await db.insert(captions).values({ draftId: draft!.id, style: "minimal", text: "Sunday.", selected: true });
    return draft!.id;
  }

  beforeAll(async () => {
    ({ db, cleanup: close } = await createTestDatabase(url!));
    const [u, o] = await db
      .insert(users)
      .values([
        { email: "me@example.com", passwordHash: "x", displayName: "Me" },
        { email: "other@example.com", passwordHash: "x", displayName: "Other" },
      ])
      .returning();
    userId = u!.id;
    otherUserId = o!.id;
  });
  afterAll(async () => close?.());

  it("approval binds to content; editing the caption afterwards blocks publishing", async () => {
    const id = await makeDraft();
    const { contentHash } = await approveDraft(db, userId, id);
    const approval = await latestApproval(db, id);
    expect(approval?.contentHash).toBe(contentHash);

    const ok = evaluatePublish({
      globalPublishingEnabled: true,
      target: { publishingEnabled: true },
      draft: { id, status: "approved", contentHash },
      approval: { decision: "approved", contentHash: approval!.contentHash, approvedByUserId: userId },
    });
    expect(ok.allowed).toBe(true);

    await db.update(captions).set({ editedText: "Sunday reset." }).where(eq(captions.draftId, id));
    const current = computeDraftContentHash(await loadDraftContent(db, id));
    const after = evaluatePublish({
      globalPublishingEnabled: true,
      target: { publishingEnabled: true },
      draft: { id, status: "approved", contentHash: current },
      approval: { decision: "approved", contentHash: approval!.contentHash, approvedByUserId: userId },
    });
    expect(after.allowed).toBe(false);
  });

  it("records rejection reasons as feedback", async () => {
    const id = await makeDraft();
    await rejectDraft(db, userId, id, ["too_edited", "bad_song"], "less filter");
    const [f] = await db.select().from(feedback).where(and(eq(feedback.draftId, id), eq(feedback.signal, "rejected")));
    expect(f?.reasons).toEqual(["too_edited", "bad_song"]);
  });

  it("cannot approve another user's draft or a draft still generating", async () => {
    const id = await makeDraft();
    await expect(approveDraft(db, otherUserId, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const gen = await makeDraft("generating");
    await expect(approveDraft(db, userId, gen)).rejects.toThrow(/Illegal draft transition/);
  });

  it("revoking returns the draft to review", async () => {
    const id = await makeDraft();
    await approveDraft(db, userId, id);
    await revokeApproval(db, userId, id);
    const [d] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, id));
    expect(d?.status).toBe("ready_for_review");
    expect((await latestApproval(db, id))?.decision).toBe("revoked");
  });
});
