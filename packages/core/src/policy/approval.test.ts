import { describe, expect, it } from "vitest";
import { assertTransition, authorizePublish, computeDraftContentHash, evaluatePublish, type PublishCheckInput } from "./approval";

const content = {
  format: "post",
  media: [{ position: 0, assetId: "a", editVersionId: "v1" }],
  caption: "hello",
  hashtags: ["x"],
};
const hash = computeDraftContentHash(content);

function input(overrides: Partial<PublishCheckInput> = {}): PublishCheckInput {
  return {
    globalPublishingEnabled: true,
    target: { publishingEnabled: true },
    draft: { id: "d1", status: "approved", contentHash: hash },
    approval: { decision: "approved", contentHash: hash, approvedByUserId: "u1" },
    ...overrides,
  };
}

describe("approval gate", () => {
  it("allows publishing only when every condition holds", () => {
    expect(evaluatePublish(input()).allowed).toBe(true);
    expect(authorizePublish(input()).draftId).toBe("d1");
  });

  it("is off by default via the global kill switch", () => {
    const r = evaluatePublish(input({ globalPublishingEnabled: false }));
    expect(r.allowed).toBe(false);
    expect(r.reasons.join()).toMatch(/disabled globally/);
  });

  it("requires a human approval", () => {
    expect(evaluatePublish(input({ approval: null })).allowed).toBe(false);
    expect(() => authorizePublish(input({ approval: null }))).toThrow(/not authorized/);
  });

  it("invalidates approval if content changed afterwards", () => {
    const changed = computeDraftContentHash({ ...content, caption: "edited" });
    const r = evaluatePublish(input({ draft: { id: "d1", status: "approved", contentHash: changed } }));
    expect(r.allowed).toBe(false);
    expect(r.reasons.join()).toMatch(/re-approved/);
  });

  it("rejects when the account has publishing disabled", () => {
    expect(evaluatePublish(input({ target: { publishingEnabled: false } })).allowed).toBe(false);
  });

  it("content hash is independent of media order in the array", () => {
    const a = computeDraftContentHash({ ...content, media: [{ position: 1, assetId: "b", editVersionId: null }, { position: 0, assetId: "a", editVersionId: "v1" }] });
    const b = computeDraftContentHash({ ...content, media: [{ position: 0, assetId: "a", editVersionId: "v1" }, { position: 1, assetId: "b", editVersionId: null }] });
    expect(a).toBe(b);
  });
});

describe("draft transitions", () => {
  it("agent can mark drafts ready but never approve or publish", () => {
    expect(() => assertTransition("generating", "ready_for_review", "agent")).not.toThrow();
    expect(() => assertTransition("ready_for_review", "approved", "agent")).toThrow(/Only a human/);
    expect(() => assertTransition("approved", "published", "agent")).toThrow(/Only a human/);
    expect(() => assertTransition("ready_for_review", "approved", "user")).not.toThrow();
  });

  it("rejects illegal transitions", () => {
    expect(() => assertTransition("generating", "published", "user")).toThrow(/Illegal/);
  });
});
