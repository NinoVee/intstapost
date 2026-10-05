import "server-only";
import { NextResponse } from "next/server";
import { AppError, denialMessage, principalCan, type Capability } from "@intstapost/core";
import { getLogger } from "@intstapost/core/logger";
import { env } from "./server";
import { agentRateLimited, getAuth, type Auth } from "./auth";

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
 * Authenticate an API request from the browser (cookie), the Apple app (session token) or an
 * AI agent (scoped agent key), and check it may perform `capability`.
 * Cookie-authenticated mutations must also pass the same-origin check.
 */
export async function authenticateApi(req: Request, opts: { mutation: boolean; capability: Capability }): Promise<Auth | NextResponse> {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (auth.principal.kind === "agent" && agentRateLimited(auth.principal.keyId)) {
    return NextResponse.json({ error: "Too many requests from this agent key. Slow down.", code: "RATE_LIMITED" }, { status: 429 });
  }
  if (!principalCan(auth.principal, opts.capability)) {
    return NextResponse.json({ error: denialMessage(opts.capability), code: "FORBIDDEN_FOR_AGENT" }, { status: 403 });
  }
  if (opts.mutation && auth.via === "cookie" && !isSameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin", code: "BAD_ORIGIN" }, { status: 403 });
  }
  return auth;
}

/** Agents without the "media" scope get descriptions and scores, never photo URLs. */
export function canSeeMedia(auth: Auth): boolean {
  return principalCan(auth.principal, "media");
}

export function actorOf(auth: Auth): { actor: "user" | "agent"; agentKeyId?: string } {
  return auth.principal.kind === "agent" ? { actor: "agent", agentKeyId: auth.principal.keyId } : { actor: "user" };
}
