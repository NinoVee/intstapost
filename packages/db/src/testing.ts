import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";

/**
 * Creates an isolated, migrated database for one test file and drops it after.
 * Requires TEST_DATABASE_URL pointing at a role with CREATEDB.
 */
export async function createTestDatabase(adminUrl: string): Promise<{ db: Database; url: string; cleanup: () => Promise<void> }> {
  const name = `intstapost_t_${randomBytes(5).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const url = u.toString();
  await runMigrations(url);
  const { db, close } = createDb(url);
  return {
    db,
    url,
    cleanup: async () => {
      await close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}
