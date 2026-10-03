import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@intstapost/core";
import { getLogger } from "@intstapost/core/logger";
import { env } from "./server";

/** CSRF defence for route handlers: state-changing requests must come from our own origin. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const allowed = new URL(env().APP_URL).origin;
    const self = new URL(req.url).origin;
    return origin === allowed || origin === self;
  } catch {
    return false;
  }
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof AppError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  getLogger({ module: "http" }).error({ err }, "unhandled error");
  return NextResponse.json({ error: "Internal error", code: "INTERNAL" }, { status: 500 });
}
