import { createDb } from "./client";
import { seedUserDefaults } from "./defaults";
import { users } from "./schema";

/** Re-applies defaults for every existing user (idempotent). Create the owner with `pnpm owner:create`. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, close } = createDb(url);
  try {
    const all = await db.select({ id: users.id, tz: users.timezone }).from(users);
    for (const u of all) await seedUserDefaults(db, u.id, u.tz);
    console.log(`seeded defaults for ${all.length} user(s)`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
