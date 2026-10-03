import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, greeting } from "./format";

describe("format helpers", () => {
  it("greets by the user's local time", () => {
    const at = new Date("2026-10-03T20:00:00Z");
    expect(greeting("UTC", at)).toBe("Good evening");
    expect(greeting("America/Los_Angeles", at)).toBe("Good afternoon");
    expect(greeting("Asia/Tokyo", at)).toBe("Good morning");
    expect(greeting("Not/AZone", at)).toBe("Good evening");
  });
  it("formats sizes and durations", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatDuration(75_000)).toBe("1:15");
  });
});
