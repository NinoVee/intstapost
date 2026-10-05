import { NextResponse } from "next/server";
import { revokeSessionToken } from "@/lib/auth";
import { authenticateApi } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Revokes the calling session (the app's bearer token). */
export async function POST(req: Request) {
  const auth = await authenticateApi(req, { mutation: true, capability: "manage_keys" });
  if (auth instanceof NextResponse) return auth;
  await revokeSessionToken(auth.token);
  return NextResponse.json({ ok: true });
}
