import { NextResponse } from "next/server";
import { verifyMediaSignature } from "@intstapost/media";
import { principalCan } from "@intstapost/core";
import { getAuth } from "@/lib/auth";
import { env, storage } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tiff: "image/tiff",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

/** Serves private media: requires BOTH a valid session and a valid, unexpired signature for that user. */
export async function GET(req: Request) {
  // Web session, Apple app token, or an agent key that was explicitly given the "media" scope.
  const auth = await getAuth();
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });
  if (!principalCan(auth.principal, "media")) return new NextResponse("This agent key may not view photos", { status: 403 });
  const user = auth.user;
  const sp = new URL(req.url).searchParams;
  const v = verifyMediaSignature({ key: sp.get("key"), exp: sp.get("exp"), sig: sp.get("sig") }, user.id, env().APP_SECRET);
  if (!v.ok) return new NextResponse("Forbidden", { status: 403 });
  try {
    const body = await storage().get(v.key);
    const ext = v.key.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": `private, max-age=${env().SIGNED_URL_TTL_SECONDS}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
