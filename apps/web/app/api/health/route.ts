import { NextResponse } from "next/server";
import { sql } from "@intstapost/db";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
