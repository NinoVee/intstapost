import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __intstapostSql?: postgres.Sql; __intstapostDb?: Database };

/** Shared connection pool (survives Next.js dev hot reloads). */
export function getDb(url = process.env.DATABASE_URL): Database {
  if (globalForDb.__intstapostDb) return globalForDb.__intstapostDb;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), onnotice: () => {} });
  globalForDb.__intstapostSql = sql;
  globalForDb.__intstapostDb = drizzle(sql, { schema });
  return globalForDb.__intstapostDb;
}

export function createDb(url: string, max = 5): { db: Database; close: () => Promise<void> } {
  const sql = postgres(url, { max, onnotice: () => {} });
  return { db: drizzle(sql, { schema }), close: () => sql.end({ timeout: 5 }) };
}

export async function closeDb(): Promise<void> {
  await globalForDb.__intstapostSql?.end({ timeout: 5 });
  globalForDb.__intstapostSql = undefined;
  globalForDb.__intstapostDb = undefined;
}
