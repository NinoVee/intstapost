import { hmacSign, hmacVerify } from "@intstapost/core";

/**
 * Signed media URLs served by the app (`/api/media/file`). A signature binds
 * key + expiry + user; the route additionally requires an authenticated session
 * of that same user, so a leaked URL alone is not enough while logged out.
 */
export function signMediaPath(key: string, userId: string, ttlSeconds: number, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const sig = hmacSign(`${key}|${userId}|${exp}`, secret);
  const params = new URLSearchParams({ key, exp: String(exp), sig });
  return `/api/media/file?${params.toString()}`;
}

export function verifyMediaSignature(
  params: { key: string | null; exp: string | null; sig: string | null },
  userId: string,
  secret: string,
  now = Date.now(),
): { ok: true; key: string } | { ok: false; reason: string } {
  const { key, exp, sig } = params;
  if (!key || !exp || !sig) return { ok: false, reason: "missing" };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < now) return { ok: false, reason: "expired" };
  if (!hmacVerify(`${key}|${userId}|${expNum}`, sig, secret)) return { ok: false, reason: "bad_signature" };
  if (!key.startsWith(`originals/${userId}/`) && !key.startsWith(`derived/${userId}/`)) return { ok: false, reason: "forbidden" };
  return { ok: true, key };
}
