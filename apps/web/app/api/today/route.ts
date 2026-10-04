import { NextResponse } from "next/server";
import { greeting } from "@/lib/format";
import { authenticateApi, jsonError } from "@/lib/http";
import { listActiveDrafts, pipelineStats, recentAgentRuns } from "@/lib/queries";
import { env } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Everything the app's Today screen needs in one call. */
export async function GET(req: Request) {
  const auth = await authenticateApi(req, { mutation: false });
  if (auth instanceof NextResponse) return auth;
  try {
    const [drafts, stats, runs] = await Promise.all([listActiveDrafts(auth.user.id), pipelineStats(auth.user.id), recentAgentRuns()]);
    return NextResponse.json({
      greeting: greeting(auth.user.timezone),
      user: auth.user,
      publishingEnabled: env().PUBLISHING_ENABLED,
      drafts,
      stats,
      runs: runs.map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt, summary: r.error ?? (typeof r.output.summary === "string" ? r.output.summary : null) })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
