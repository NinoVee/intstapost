import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://x",
  APP_SECRET: "a".repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("env", () => {
  it("defaults publishing to off", () => {
    const env = parseEnv(base);
    expect(env.PUBLISHING_ENABLED).toBe(false);
    expect(env.ALLOW_EXTERNAL_TRAINING).toBe(false);
    expect(env.STORAGE_DRIVER).toBe("local");
  });
  it("rejects weak secrets", () => {
    expect(() => parseEnv({ ...base, APP_SECRET: "short" })).toThrow(/APP_SECRET/);
    expect(() => parseEnv({ ...base, ENCRYPTION_KEY: "abc" })).toThrow(/ENCRYPTION_KEY/);
  });
  it("requires S3 settings with the s3 driver", () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });
  it("parses import roots", () => {
    expect(parseEnv({ ...base, MEDIA_IMPORT_ROOTS: "/a, /b" }).MEDIA_IMPORT_ROOTS).toEqual(["/a", "/b"]);
  });
});
