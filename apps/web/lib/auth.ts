import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, isAgentKey, normalizeScopes, randomToken, sha256Hex, verifyPassword, type Principal } from "@intstapost/core";
import { agentKeys, and, audit, eq, gt, isNull, sessions, users } from "@intstapost/db";
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

/** Extracts a bearer token (native app or AI agent key) from the Authorization header. */
export function parseBearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/);
  return m?.[1] ?? null;
}

export interface Auth {
  user: CurrentUser;
  /** "bearer" requests carry no ambient credentials, so they are not CSRF-prone. */
  via: "cookie" | "bearer";
  token: string;
  /** The human owner, or an external AI agent acting with a scoped key. */
  principal: Principal;
}

/* Per-agent-key rate limit: 120 requests / minute (single instance, in-memory). */
const agentHits = new Map<string, { count: number; resetAt: number }>();
export function agentRateLimited(keyId: string, now = Date.now()): boolean {
  const h = agentHits.get(keyId);
  if (!h || h.resetAt < now) {
    agentHits.set(keyId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > 120;
}

async function agentAuth(token: string): Promise<Auth | null> {
  const [row] = await db()
    .select({
      keyId: agentKeys.id,
      name: agentKeys.name,
      scopes: agentKeys.scopes,
      lastUsedAt: agentKeys.lastUsedAt,
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(agentKeys)
    .innerJoin(users, eq(users.id, agentKeys.userId))
    .where(and(eq(agentKeys.keyHash, sha256Hex(token)), isNull(agentKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db().update(agentKeys).set({ lastUsedAt: new Date() }).where(eq(agentKeys.id, row.keyId));
  }
  return {
    user: { id: row.id, email: row.email, displayName: row.displayName, timezone: row.timezone },
    via: "bearer",
    token,
    principal: { kind: "agent", keyId: row.keyId, name: row.name, scopes: normalizeScopes(row.scopes) },
  };
}

export const getAuth = cache(async (): Promise<Auth | null> => {
  const bearer = parseBearer((await headers()).get("authorization"));
  if (bearer && isAgentKey(bearer)) return agentAuth(bearer);
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const token = bearer ?? cookie;
  if (!token) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ? { user: row, via: bearer ? "bearer" : "cookie", token, principal: { kind: "user" } } : null;
});

/** The signed-in HUMAN. Agent keys never count, so they can't open web pages or run server actions. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const auth = await getAuth();
  return auth && auth.principal.kind === "user" ? auth.user : null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
