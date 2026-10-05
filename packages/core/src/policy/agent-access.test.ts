import { describe, expect, it } from "vitest";
import { HUMAN_ONLY_CAPABILITIES, isAgentKey, normalizeScopes, principalCan, type Principal } from "./agent-access";

const human: Principal = { kind: "user" };
const allScopes: Principal = { kind: "agent", keyId: "k", name: "Muse", scopes: ["read", "organize", "jobs", "media"] };
const readOnly: Principal = { kind: "agent", keyId: "k", name: "Muse", scopes: ["read"] };

describe("agent access", () => {
  it("humans can do everything", () => {
    for (const cap of ["read", "approve", "publish", "manage_keys", "upload"] as const) expect(principalCan(human, cap)).toBe(true);
  });

  it("agents can never approve, reject, publish, upload or manage keys — even with every scope", () => {
    for (const cap of HUMAN_ONLY_CAPABILITIES) expect(principalCan(allScopes, cap)).toBe(false);
  });

  it("agents get exactly their scopes", () => {
    expect(principalCan(readOnly, "read")).toBe(true);
    expect(principalCan(readOnly, "organize")).toBe(false);
    expect(principalCan(readOnly, "media")).toBe(false);
    expect(principalCan(allScopes, "jobs")).toBe(true);
  });

  it("normalises scopes and always includes read", () => {
    expect(normalizeScopes(["jobs", "approve", "bogus"])).toEqual(["read", "jobs"]);
    expect(normalizeScopes([])).toEqual(["read"]);
  });

  it("recognises agent keys by prefix", () => {
    expect(isAgentKey("isa_abc")).toBe(true);
    expect(isAgentKey("abc")).toBe(false);
  });
});
