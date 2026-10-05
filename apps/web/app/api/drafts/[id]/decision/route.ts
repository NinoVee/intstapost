import { NextResponse } from "next/server";
import { z } from "zod";
import { REJECTION_REASONS } from "@intstapost/core";
import { approveDraft, rejectDraft, saveDraftForLater } from "@intstapost/db";
import { clientIp } from "@/lib/auth";
import { actorOf, authenticateApi, jsonError } from "@/lib/http";
import { denialMessage, principalCan } from "@intstapost/core";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({ decision: z.literal("save_for_later") }),
  z.object({ decision: z.literal("reject"), reasons: z.array(z.enum(REJECTION_REASONS)).max(10).default([]), comment: z.string().max(500).optional() }),
]);

/** Human decisions on a draft. Approving never publishes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, { mutation: true, capability: "read" });
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "Invalid decision", code: "BAD_REQUEST" }, { status: 400 });
    const d = body.data;
    // Approve and reject are human-only; saving for later is an "organize" action.
    const capability = d.decision === "approve" ? "approve" : d.decision === "reject" ? "reject" : "organize";
    if (!principalCan(auth.principal, capability)) {
      return NextResponse.json({ error: denialMessage(capability), code: "FORBIDDEN_FOR_AGENT" }, { status: 403 });
    }
    const ip = await clientIp();
    if (d.decision === "approve") await approveDraft(db(), auth.user.id, id, ip);
    else if (d.decision === "save_for_later") await saveDraftForLater(db(), auth.user.id, id, ip, actorOf(auth));
    else await rejectDraft(db(), auth.user.id, id, d.reasons, d.comment, ip);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
