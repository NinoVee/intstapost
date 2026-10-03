import { NextResponse } from "next/server";
import { AppError } from "@intstapost/core";
import { and, eq, mediaSources } from "@intstapost/db";
import { ingestMedia } from "@intstapost/media";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { isSameOrigin, jsonError } from "@/lib/http";
import { db, env, intakeQueue, storage } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 50;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new AppError("No files", "NO_FILES", 400);
    if (files.length > MAX_FILES) throw new AppError(`At most ${MAX_FILES} files per upload`, "TOO_MANY_FILES", 400);

    const [source] = await db()
      .select({ id: mediaSources.id })
      .from(mediaSources)
      .where(and(eq(mediaSources.userId, user.id), eq(mediaSources.kind, "upload")))
      .limit(1);

    const ip = await clientIp();
    const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
    const results: Array<{ filename: string; assetId?: string; duplicate?: boolean; error?: string }> = [];
    for (const file of files) {
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        const r = await ingestMedia(
          { db: db(), storage: storage(), tempRoot: env().TEMP_ROOT },
          { userId: user.id, sourceId: source?.id ?? null, filename: file.name, bytes, maxBytes, ipAddress: ip },
        );
        if (r.needsAnalysis) {
          await intakeQueue().add("analyze", { type: "analyze_asset", assetId: r.assetId, userId: user.id }, { jobId: `analyze-${r.assetId}`, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
        }
        results.push({ filename: file.name, assetId: r.assetId, duplicate: r.duplicate });
      } catch (err) {
        results.push({ filename: file.name, error: err instanceof AppError ? err.message : "Upload failed" });
        if (!(err instanceof AppError)) throw err;
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}
