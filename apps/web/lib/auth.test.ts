import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./server", () => ({ db: vi.fn(), env: vi.fn() }));

const { parseBearer } = await import("./auth");

describe("parseBearer", () => {
  it("accepts well-formed bearer tokens only", () => {
    const t = "a".repeat(43);
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(`Basic ${t}`)).toBeNull();
    expect(parseBearer("Bearer short")).toBeNull();
    expect(parseBearer(`Bearer ${t}; drop table`)).toBeNull();
  });
});
