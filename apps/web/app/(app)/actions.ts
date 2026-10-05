"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { REJECTION_REASONS } from "@intstapost/core";
import {
  and,
  approveDraft,
  audit,
  contentThemes,
  eq,
  mediaAssets,
  rejectDraft,
  saveDraftForLater,
} from "@intstapost/db";
import { clientIp, logout, requireUser } from "@/lib/auth";
import { createAgentKey, revokeAgentKey } from "@/lib/agent-keys";
import { db } from "@/lib/server";

const uuid = z.string().uuid();

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/* ---------- draft decisions (human-only) ---------- */

export async function approveDraftAction(draftId: string) {
  const user = await requireUser();
  await approveDraft(db(), user.id, uuid.parse(draftId), await clientIp());
  revalidatePath("/");
}

export async function rejectDraftAction(draftId: string, form: FormData) {
  const user = await requireUser();
  const reasons = z.array(z.enum(REJECTION_REASONS)).parse(form.getAll("reasons"));
  const comment = z.string().max(500).optional().parse(form.get("comment") || undefined);
  await rejectDraft(db(), user.id, uuid.parse(draftId), reasons, comment, await clientIp());
  revalidatePath("/");
}

export async function saveForLaterAction(draftId: string) {
  const user = await requireUser();
  await saveDraftForLater(db(), user.id, uuid.parse(draftId), await clientIp());
  revalidatePath("/");
}

/* ---------- media ---------- */

/** "Never use this picture." Excluded media is skipped by every agent. Reversible. */
export async function setAssetExcludedAction(assetId: string, excluded: boolean) {
  const user = await requireUser();
  const id = uuid.parse(assetId);
  await db()
    .update(mediaAssets)
    .set({ excluded })
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, user.id)));
  await audit(db(), { userId: user.id, actor: "user", action: excluded ? "media.excluded" : "media.included", entityType: "media_asset", entityId: id, ipAddress: await clientIp() });
  revalidatePath(`/library/${id}`);
  revalidatePath("/library");
}

/* ---------- themes ---------- */

export async function setThemeEnabledAction(themeId: string, enabled: boolean) {
  const user = await requireUser();
  await db()
    .update(contentThemes)
    .set({ enabled })
    .where(and(eq(contentThemes.id, uuid.parse(themeId)), eq(contentThemes.userId, user.id)));
  revalidatePath("/settings");
}

export async function setThemePriorityAction(themeId: string, form: FormData) {
  const user = await requireUser();
  const priority = z.coerce.number().int().min(0).max(5).parse(form.get("priority"));
  await db()
    .update(contentThemes)
    .set({ priority })
    .where(and(eq(contentThemes.id, uuid.parse(themeId)), eq(contentThemes.userId, user.id)));
  revalidatePath("/settings");
}

const themeName = z.string().trim().min(2).max(40);

export async function addThemeAction(form: FormData) {
  const user = await requireUser();
  const name = themeName.parse(form.get("name"));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  await db().insert(contentThemes).values({ userId: user.id, slug, name }).onConflictDoNothing();
  revalidatePath("/settings");
}

export async function renameThemeAction(themeId: string, form: FormData) {
  const user = await requireUser();
  await db()
    .update(contentThemes)
    .set({ name: themeName.parse(form.get("name")) })
    .where(and(eq(contentThemes.id, uuid.parse(themeId)), eq(contentThemes.userId, user.id)));
  revalidatePath("/settings");
}

export async function deleteThemeAction(themeId: string) {
  const user = await requireUser();
  await db()
    .delete(contentThemes)
    .where(and(eq(contentThemes.id, uuid.parse(themeId)), eq(contentThemes.userId, user.id)));
  revalidatePath("/settings");
}

/* ---------- AI agent keys (human-only) ---------- */

export type CreateKeyState = { key?: string; name?: string; error?: string } | undefined;

export async function createAgentKeyAction(_prev: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(60).safeParse(form.get("name"));
  if (!name.success) return { error: "Give the key a name, e.g. “Meta Muse”." };
  const scopes = form.getAll("scopes").filter((v): v is string => typeof v === "string");
  const { key } = await createAgentKey(user.id, name.data, scopes, await clientIp());
  revalidatePath("/settings");
  return { key, name: name.data };
}

export async function revokeAgentKeyAction(keyId: string) {
  const user = await requireUser();
  await revokeAgentKey(user.id, uuid.parse(keyId), await clientIp());
  revalidatePath("/settings");
}
