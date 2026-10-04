import { NextResponse } from "next/server";
import { z } from "zod";
import { and, audit, eq, mediaAssets } from "@intstapost/db";
import { clientIp } from "@/lib/auth";
import { authenticateApi, jsonError } from "@/lib/http";
import { getAssetDetail } from "@/lib/queries";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, { mutation: false });
  if (auth instanceof NextResponse) return auth;
  try {
    const detail = await getAssetDetail(auth.user.id, (await params).id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const a = detail.asset;
    return NextResponse.json({
      asset: {
        id: a.id,
        kind: a.kind,
        status: a.status,
        mimeType: a.mimeType,
        originalFilename: a.originalFilename,
        width: a.width,
        height: a.height,
        durationMs: a.durationMs,
        sizeBytes: a.sizeBytes,
        capturedAt: a.capturedAt,
        hasApproxLocation: a.approxLatitude !== null,
        excluded: a.excluded,
        isRepresentative: a.isClusterRepresentative,
        isBlurry: detail.deterministic?.isBlurry ?? null,
        source: detail.source,
        createdAt: a.createdAt,
      },
      scores: detail.scores,
      previewUrl: detail.previewUrl,
      originalUrl: detail.originalUrl,
      similar: detail.similar,
    });
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({ excluded: z.boolean() });

/** "Never use this picture" toggle (reversible). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, { mutation: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const body = patchSchema.safeParse(await req.json().catch(() => null));
    if (!body.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const updated = await db()
      .update(mediaAssets)
      .set({ excluded: body.data.excluded })
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, auth.user.id)))
      .returning({ id: mediaAssets.id });
    if (!updated.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit(db(), { userId: auth.user.id, actor: "user", action: body.data.excluded ? "media.excluded" : "media.included", entityType: "media_asset", entityId: id, ipAddress: await clientIp() });
    return NextResponse.json({ ok: true, excluded: body.data.excluded });
  } catch (err) {
    return jsonError(err);
  }
}
