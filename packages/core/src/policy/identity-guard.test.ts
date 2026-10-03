import { describe, expect, it } from "vitest";
import { IdentityPreservationGuard, IDENTITY_PRESERVATION_CLAUSE, type EditRequestInput } from "./identity-guard";

const guard = new IdentityPreservationGuard();
const people = { hasPeople: true, hasChildren: false };
const kids = { hasPeople: true, hasChildren: true };
const scenery = { hasPeople: false, hasChildren: false };

function req(partial: Partial<EditRequestInput>): EditRequestInput {
  return { assetId: "a1", operations: [], requestedIntensity: 2, subjects: people, ...partial };
}

describe("IdentityPreservationGuard — face identity", () => {
  const blocked = [
    "face swap me with my friend",
    "Replace my face with a model's",
    "make my nose smaller",
    "reshape the jawline",
    "give me a sharper jawline and bigger eyes",
    "slim face a little",
    "make me look 10 years younger",
    "de-age him",
    "make her look like a celebrity",
    "turn me into a different person",
    "lighten my skin",
    "a  NOSE   job please", // whitespace + case
  ];
  for (const prompt of blocked) {
    it(`blocks: "${prompt}"`, () => {
      const r = guard.check(req({ prompt }));
      expect(r.allowed).toBe(false);
    });
  }

  it("blocks identity edits even with an explicit override", () => {
    const r = guard.check(req({ prompt: "change my eye shape", explicitUserOverride: { intensity: 5, allowCreativeScene: true } }));
    expect(r.allowed).toBe(false);
  });

  it("blocks face swap even when no people were detected", () => {
    expect(guard.check(req({ prompt: "faceswap", subjects: scenery })).allowed).toBe(false);
  });

  it("allows subtle lighting/colour work and appends the preservation clause", () => {
    const r = guard.check(req({ prompt: "warmer lighting, fix white balance", operations: ["exposure", "white_balance", "color_correct"] }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.prompt).toContain(IDENTITY_PRESERVATION_CLAUSE);
    expect(r.request.negativePrompt).toMatch(/face swap/);
    expect(r.request.operations).toEqual(["exposure", "white_balance", "color_correct"]);
  });
});

describe("IdentityPreservationGuard — intensity", () => {
  it("clamps people edits to the default ceiling of 2", () => {
    const r = guard.check(req({ requestedIntensity: 4, operations: ["color_correct", "clothing_replace"] }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.effectiveIntensity).toBe(2);
    expect(r.droppedOperations).toContain("clothing_replace");
  });

  it("honours an explicit user override and labels clothing replacement", () => {
    const r = guard.check(req({ requestedIntensity: 4, operations: ["clothing_replace"], explicitUserOverride: { intensity: 4 } }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.effectiveIntensity).toBe(4);
    expect(r.request.disclosureLabels).toContain("ai_modified_clothing");
  });

  it("does not clamp background-only media", () => {
    const r = guard.check(req({ subjects: scenery, requestedIntensity: 4, operations: ["sky_replace", "background_replace"] }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.effectiveIntensity).toBe(4);
    expect(r.request.operations).toEqual(["sky_replace", "background_replace"]);
  });

  it("reduces level 5 to 4 without creative mode", () => {
    const r = guard.check(req({ subjects: scenery, requestedIntensity: 5, operations: ["cinematic_style"] }));
    expect(r.allowed && r.request.effectiveIntensity).toBe(4);
  });
});

describe("IdentityPreservationGuard — body & children", () => {
  it("blocks major body changes by default", () => {
    expect(guard.check(req({ prompt: "make me look much thinner" })).allowed).toBe(false);
    expect(guard.check(req({ prompt: "add a six pack" })).allowed).toBe(false);
  });

  it("allows a major body request only with an explicit level-4 override, labelled", () => {
    const r = guard.check(req({ prompt: "add abs", explicitUserOverride: { intensity: 4 } }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.disclosureLabels).toContain("ai_body_adjustment");
  });

  it("never allows body edits on children", () => {
    expect(guard.check(req({ subjects: kids, prompt: "make him taller", explicitUserOverride: { intensity: 5 } })).allowed).toBe(false);
    const r = guard.check(req({ subjects: kids, requestedIntensity: 3, operations: ["body_slim_slight", "color_correct"], explicitUserOverride: { intensity: 4 } }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.operations).toEqual(["color_correct"]);
  });

  it("caps child media at colour-only without override", () => {
    const r = guard.check(req({ subjects: kids, requestedIntensity: 3, operations: ["color_correct", "skin_cleanup"] }));
    expect(r.allowed && r.request.effectiveIntensity).toBe(1);
    expect(r.allowed && r.request.operations).toEqual(["color_correct"]);
  });
});

describe("IdentityPreservationGuard — misleading scenes", () => {
  it("blocks placing a person somewhere they weren't without creative mode", () => {
    expect(guard.check(req({ prompt: "put me in Paris in front of the Eiffel Tower" })).allowed).toBe(false);
    expect(guard.check(req({ prompt: "add a lamborghini next to me" })).allowed).toBe(false);
  });

  it("allows it in explicit creative mode with a creative label", () => {
    const r = guard.check(req({ prompt: "put me in Paris", explicitUserOverride: { intensity: 4, allowCreativeScene: true } }));
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.request.disclosureLabels).toContain("creative_ai_scene");
  });

  it("drops background_replace on media with people unless creative mode", () => {
    const r = guard.check(req({ requestedIntensity: 4, operations: ["background_replace"], explicitUserOverride: { intensity: 4 } }));
    expect(r.allowed && r.droppedOperations).toEqual(["background_replace"]);
  });
});

describe("IdentityPreservationGuard — false positives", () => {
  it("does not block ordinary background/clothing language", () => {
    for (const prompt of ["remove the trash can behind me", "make the sky more dramatic", "brighten the shirt colour slightly", "make the background less busy"]) {
      const r = guard.check(req({ prompt, subjects: people }));
      expect(r.allowed, prompt).toBe(true);
    }
  });
});
