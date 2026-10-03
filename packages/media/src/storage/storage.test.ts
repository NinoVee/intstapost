import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorage } from "./local";
import { signMediaPath, verifyMediaSignature } from "./signing";
import { ObjectExistsError } from "./types";

async function store() {
  return new LocalStorage(await mkdtemp(path.join(os.tmpdir(), "intstapost-store-")));
}

describe("LocalStorage", () => {
  it("writes originals once and refuses overwrite", async () => {
    const s = await store();
    await s.putImmutable("originals/u1/ab/abc.jpg", Buffer.from("one"), "image/jpeg");
    await expect(s.putImmutable("originals/u1/ab/abc.jpg", Buffer.from("two"), "image/jpeg")).rejects.toBeInstanceOf(ObjectExistsError);
    expect((await s.get("originals/u1/ab/abc.jpg")).toString()).toBe("one");
  });

  it("refuses to delete or plain-put originals", async () => {
    const s = await store();
    await s.putImmutable("originals/u1/x.jpg", Buffer.from("a"), "image/jpeg");
    await expect(s.delete("originals/u1/x.jpg")).rejects.toThrow(/Refusing/);
    await expect(s.put("originals/u1/y.jpg", Buffer.from("a"), "image/jpeg")).rejects.toThrow(/putImmutable/);
  });

  it("rejects path traversal keys", async () => {
    const s = await store();
    await expect(s.get("../etc/passwd")).rejects.toThrow(/Unsafe/);
    await expect(s.put("derived/../../x", Buffer.from("a"), "x")).rejects.toThrow(/Unsafe/);
    await expect(s.get("/etc/passwd")).rejects.toThrow(/Unsafe/);
  });

  it("derived objects can be replaced and deleted; list works", async () => {
    const s = await store();
    await s.put("tmp/u1/a.bin", Buffer.from("1"), "x");
    await s.put("tmp/u1/a.bin", Buffer.from("2"), "x");
    expect((await s.get("tmp/u1/a.bin")).toString()).toBe("2");
    expect((await s.list("tmp/")).map((o) => o.key)).toEqual(["tmp/u1/a.bin"]);
    await s.delete("tmp/u1/a.bin");
    expect(await s.exists("tmp/u1/a.bin")).toBe(false);
  });
});

describe("signed media URLs", () => {
  const secret = "s".repeat(40);
  it("verifies a fresh signature for the right user", () => {
    const url = new URL(signMediaPath("derived/u1/a/preview.jpg", "u1", 60, secret), "http://x");
    const p = { key: url.searchParams.get("key"), exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
    expect(verifyMediaSignature(p, "u1", secret)).toEqual({ ok: true, key: "derived/u1/a/preview.jpg" });
    expect(verifyMediaSignature(p, "u2", secret).ok).toBe(false);
    expect(verifyMediaSignature(p, "u1", secret, Date.now() + 120_000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyMediaSignature({ ...p, key: "derived/u1/b/preview.jpg" }, "u1", secret).ok).toBe(false);
  });
  it("refuses keys outside the user's namespace even if signed", () => {
    const url = new URL(signMediaPath("derived/u2/a.jpg", "u1", 60, secret), "http://x");
    const p = { key: url.searchParams.get("key"), exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig") };
    expect(verifyMediaSignature(p, "u1", secret)).toEqual({ ok: false, reason: "forbidden" });
  });
});
