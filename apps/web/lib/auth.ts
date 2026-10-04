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

export type CredentialResult = { ok: true; user: CurrentUser } | { ok: false; error: string };

/** Shared by the web form and the native app: throttling, constant-ish timing, audit. */
export async function verifyCredentials(email: string, password: string): Promise<CredentialResult> {
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
  return { ok: true, user: { id: user.id, email: user.email, displayName: user.displayName, timezone: user.timezone } };
}

/** Creates a session row (only the token's SHA-256 is stored) and returns the raw token once. */
export async function createSession(userId: string, client: "web" | "app"): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const h = await headers();
  const ip = await clientIp();
  await db()
    .insert(sessions)
    .values({ id: sha256Hex(token), userId, expiresAt, ipAddress: ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null });
  await audit(db(), { userId, actor: "user", action: client === "app" ? "auth.login_app" : "auth.login", ipAddress: ip });
  return { token, expiresAt };
}

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Web login: sets the httpOnly session cookie. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const r = await verifyCredentials(email, password);
  if (!r.ok) return r;
  const { token } = await createSession(r.user.id, "web");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return { ok: true };
}

export async function revokeSessionToken(token: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token);
  jar.delete(SESSION_COOKIE);
}

/** Extracts a bearer token (native app) from the Authorization header. */
export function parseBearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/);
  return m?.[1] ?? null;
}

export interface Auth {
  user: CurrentUser;
  /** "bearer" requests carry no ambient credentials, so they are not CSRF-prone. */
  via: "cookie" | "bearer";
  token: string;
}

export const getAuth = cache(async (): Promise<Auth | null> => {
  const bearer = parseBearer((await headers()).get("authorization"));
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const token = bearer ?? cookie;
  if (!token) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ? { user: row, via: bearer ? "bearer" : "cookie", token } : null;
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await getAuth())?.user ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
