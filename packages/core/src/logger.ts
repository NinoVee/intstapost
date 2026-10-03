import pino, { type Logger } from "pino";

/** Paths that must never reach logs. */
export const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.cookie",
  "cookie",
  "credentials",
  "*.credentials",
];

let root: Logger | undefined;

export function getLogger(bindings?: Record<string, unknown>): Logger {
  root ??= pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    base: { app: "intstapost" },
  });
  return bindings ? root.child(bindings) : root;
}
export type { Logger } from "pino";
