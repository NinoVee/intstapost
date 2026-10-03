import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, hmacSign, hmacVerify, stableStringify, verifyPassword } from "./secrets";

const key = randomBytes(32).toString("base64");

describe("secret encryption", () => {
  it("round-trips and binds context", () => {
    const enc = encryptSecret("refresh-token-123", key, "integration:1");
    expect(enc).not.toContain("refresh-token-123");
    expect(decryptSecret(enc, key, "integration:1")).toBe("refresh-token-123");
    expect(() => decryptSecret(enc, key, "integration:2")).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"), "integration:1")).toThrow();
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery!", h)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("hmac + stable stringify", () => {
  it("verifies signatures", () => {
    const s = hmacSign("x", "secret");
    expect(hmacVerify("x", s, "secret")).toBe(true);
    expect(hmacVerify("y", s, "secret")).toBe(false);
  });
  it("sorts keys deterministically", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
});
