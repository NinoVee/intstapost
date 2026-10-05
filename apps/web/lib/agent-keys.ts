import "server-only";
import { AGENT_KEY_PREFIX, normalizeScopes, randomToken, sha256Hex, type AgentScope } from "@intstapost/core";
import { agentKeys, and, audit, desc, eq, isNull } from "@intstapost/db";
import { db } from "./server";

/** Creates a key and returns the secret ONCE. Only its SHA-256 is stored. */
export async function createAgentKey(userId: string, name: string, scopes: string[], ip: string | null): Promise<{ key: string; scopes: AgentScope[] }> {
  const key = `${AGENT_KEY_PREFIX}${randomToken(32)}`;
  const normalized = normalizeScopes(scopes);
  const [row] = await db()
    .insert(agentKeys)
    .values({ userId, name, keyHash: sha256Hex(key), keyHint: key.slice(0, 10), scopes: normalized })
    .returning({ id: agentKeys.id });
  await audit(db(), { userId, actor: "user", action: "agent_key.created", entityType: "agent_key", entityId: row!.id, metadata: { name, scopes: normalized }, ipAddress: ip });
  return { key, scopes: normalized };
}

export async function listAgentKeys(userId: string) {
  return db()
    .select({
      id: agentKeys.id,
      name: agentKeys.name,
      keyHint: agentKeys.keyHint,
      scopes: agentKeys.scopes,
      lastUsedAt: agentKeys.lastUsedAt,
      createdAt: agentKeys.createdAt,
    })
    .from(agentKeys)
    .where(and(eq(agentKeys.userId, userId), isNull(agentKeys.revokedAt)))
    .orderBy(desc(agentKeys.createdAt));
}

export async function revokeAgentKey(userId: string, keyId: string, ip: string | null): Promise<void> {
  const r = await db()
    .update(agentKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentKeys.id, keyId), eq(agentKeys.userId, userId), isNull(agentKeys.revokedAt)))
    .returning({ id: agentKeys.id });
  if (r.length) await audit(db(), { userId, actor: "user", action: "agent_key.revoked", entityType: "agent_key", entityId: keyId, ipAddress: ip });
}
