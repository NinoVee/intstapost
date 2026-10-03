import type { Database } from "./client";
import { auditLogs } from "./schema";

export interface AuditEntry {
  userId?: string | null;
  actor: "user" | "agent" | "system";
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** Append-only audit trail. Never pass secrets or media bytes in metadata. */
export async function audit(db: Pick<Database, "insert">, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
  });
}
