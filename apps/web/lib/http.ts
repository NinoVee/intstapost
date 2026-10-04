import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@intstapost/core";
import { getLogger } from "@intstapost/core/logger";
import { env } from "./server";
import { getAuth, type Auth } from "./auth";

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

/**
 * Authenticate an API request from the browser (cookie) or the native app (bearer).
 * Cookie-authenticated mutations must also pass the same-origin check.
 */
export async function authenticateApi(req: Request, opts: { mutation: boolean }): Promise<Auth | NextResponse> {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (opts.mutation && auth.via === "cookie" && !isSameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin", code: "BAD_ORIGIN" }, { status: 403 });
  }
  return auth;
}
