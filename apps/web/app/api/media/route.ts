import { NextResponse } from "next/server";
import { authenticateApi, canSeeMedia, jsonError } from "@/lib/http";
import { listMedia, parseMediaFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Paged media list: ?filter=all|best|duplicates|unusable|excluded&limit=60&before=<ISO date> */
export async function GET(req: Request) {
  const auth = await authenticateApi(req, { mutation: false, capability: "read" });
  if (auth instanceof NextResponse) return auth;
  try {
    const sp = new URL(req.url).searchParams;
    const limit = Math.max(1, Math.min(200, Number(sp.get("limit") ?? 60) || 60));
    const beforeRaw = sp.get("before");
    const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;
    const items = await listMedia(auth.user.id, parseMediaFilter(sp.get("filter")), { limit, before });
    const visible = canSeeMedia(auth) ? items : items.map((i) => ({ ...i, previewUrl: null }));
    return NextResponse.json({ items: visible, nextBefore: items.length === limit ? items.at(-1)!.createdAt : null });
  } catch (err) {
    return jsonError(err);
  }
}
