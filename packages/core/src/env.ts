import { z } from "zod";

/**
 * Server-side environment schema. Every secret lives in env / a secret manager —
 * never in source. Nothing in here may be imported by client components.
 */
const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true" || v === "1"));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    APP_TIMEZONE: z.string().default("UTC"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    /** HMAC key for sessions and signed media URLs. */
    APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
    /** base64-encoded 32-byte key used to encrypt integration credentials at rest. */
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be base64 of exactly 32 bytes"),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    MEDIA_ROOT: z.string().default("./data/media"),
    TEMP_ROOT: z.string().default("./data/tmp"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: bool(true),

    /** Directories the LocalFolderProvider is allowed to read. Anything else is refused. */
    MEDIA_IMPORT_ROOTS: csv,
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(500),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
    TEMP_FILE_MAX_AGE_HOURS: z.coerce.number().positive().default(24),

    /**
     * Global publishing kill-switch. Even when true, every publish still needs an
     * explicit human approval of the exact draft content. Default: off.
     */
    PUBLISHING_ENABLED: bool(false),
    /** Opt-in only: allow providers to retain/train on uploaded media. */
    ALLOW_EXTERNAL_TRAINING: bool(false),

    AI_DAILY_BUDGET_CENTS: z.coerce.number().int().nonnegative().default(500),
    AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().nonnegative().default(5000),

    ANTHROPIC_API_KEY: optionalString,
    HIGGSFIELD_CREDENTIALS: optionalString,
    HIGGSFIELD_IMAGE_EDIT_ENDPOINT: optionalString,
    HIGGSFIELD_VIDEO_ENDPOINT: optionalString,

    META_APP_ID: optionalString,
    META_APP_SECRET: optionalString,
    SPOTIFY_CLIENT_ID: optionalString,
    SPOTIFY_CLIENT_SECRET: optionalString,
    APPLE_MUSIC_TEAM_ID: optionalString,
    APPLE_MUSIC_KEY_ID: optionalString,
    APPLE_MUSIC_PRIVATE_KEY: optionalString,
    SOUNDCLOUD_CLIENT_ID: optionalString,
    SOUNDCLOUD_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    DROPBOX_APP_KEY: optionalString,
    DROPBOX_APP_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}
