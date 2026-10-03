import type { Env } from "@intstapost/core/env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageDriver } from "./types";

export * from "./types";
export * from "./keys";
export * from "./signing";
export { LocalStorage } from "./local";
export { S3Storage } from "./s3";

export function createStorage(env: Env): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    return new S3Storage({
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalStorage(env.MEDIA_ROOT);
}
