import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyCredentials } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(1024) });

/**
 * Native-app login. Returns a bearer token in the body (never a cookie), so a
 * cross-site request can't establish a session in the victim's browser.
 */
export async function POST(req: Request) {
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Expected JSON", code: "BAD_REQUEST" }, { status: 415 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your email and password.", code: "BAD_REQUEST" }, { status: 400 });
    const r = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!r.ok) return NextResponse.json({ error: r.error, code: "INVALID_CREDENTIALS" }, { status: 401 });
    const { token, expiresAt } = await createSession(r.user.id, "app");
    return NextResponse.json({ token, expiresAt, user: r.user }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}
