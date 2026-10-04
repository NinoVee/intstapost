import { NextResponse } from "next/server";
import { authenticateApi } from "@/lib/http";
import { env } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateApi(req, { mutation: false });
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ user: auth.user, publishingEnabled: env().PUBLISHING_ENABLED, maxUploadMb: env().MAX_UPLOAD_MB });
}
