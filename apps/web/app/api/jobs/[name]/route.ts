import { NextResponse } from "next/server";
import { audit } from "@intstapost/db";
import { clientIp } from "@/lib/auth";
import { actorOf, authenticateApi, jsonError } from "@/lib/http";
import { isJobName, JOB_DESCRIPTIONS, startJobNow } from "@/lib/jobs";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Start a studio job now (e.g. "scan for new photos"). Never publishes anything. */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateApi(req, { mutation: true, capability: "jobs" });
  if (auth instanceof NextResponse) return auth;
  try {
    const { name } = await params;
    if (!isJobName(name)) return NextResponse.json({ error: "Unknown job", jobs: Object.keys(JOB_DESCRIPTIONS) }, { status: 404 });
    const r = await startJobNow(name);
    const by = actorOf(auth);
    await audit(db(), { userId: auth.user.id, actor: by.actor, action: "job.started", entityType: "job", entityId: name, metadata: { ...r, agentKeyId: by.agentKeyId }, ipAddress: await clientIp() });
    return NextResponse.json({ job: name, ...r, message: r.queued ? `${name} started.` : `${name} is already queued or running.` });
  } catch (err) {
    return jsonError(err);
  }
}
