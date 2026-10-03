import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "@intstapost/core";
import { and, audit, eq, gt, sessions, users } from "@intstapost/db";
import { db, env } from "./server";

export const SESSION_COOKIE = "ip_session";
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/* Login throttling: 5 failures per email+IP per 15 minutes (single-instance, in-memory). */
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export function isThrottled(key: string, now = Date.now()): boolean {
  const f = failures.get(key);
  if (!f || f.until < now) return false;
  return f.count >= MAX_FAILURES;
}

function recordFailure(key: string, now = Date.now()) {
  const f = failures.get(key);
  if (!f || f.until < now) failures.set(key, { count: 1, until: now + WINDOW_MS });
  else f.count++;
}

let dummyHash: Promise<string> | undefined;
/** A real scrypt hash so unknown-email logins cost the same as real ones. */
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(24)));

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const ip = await clientIp();
  const key = `${email.toLowerCase()}|${ip ?? "?"}`;
  if (isThrottled(key)) return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  const [user] = await db().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  // Always run a hash comparison to keep timing similar for unknown emails.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) {
    recordFailure(key);
    await audit(db(), { userId: user?.id ?? null, actor: "user", action: "auth.login_failed", metadata: { email: email.toLowerCase() }, ipAddress: ip });
    return { ok: false, error: "Invalid email or password." };
  }
  failures.delete(key);

  const token = randomToken(32);
  const h = await headers();
  await db()
    .insert(sessions)
    .values({
      id: sha256Hex(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      ipAddress: ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  await audit(db(), { userId: user.id, actor: "user", action: "auth.login", ipAddress: ip });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().delete(sessions).where(eq(sessions.id, sha256Hex(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
