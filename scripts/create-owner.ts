/**
 * Create (or reset the password of) the studio owner. There is deliberately no
 * public sign-up page.
 *
 *   pnpm owner:create --email you@example.com --name "Your Name" [--timezone America/New_York]
 *
 * The password is read from OWNER_PASSWORD or prompted for (hidden).
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { hashPassword } from "@intstapost/core";
import { audit, createDb, eq, seedUserDefaults, users } from "@intstapost/db";

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(question)) out.output.write(s);
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, timezone: { type: "string", default: process.env.APP_TIMEZONE ?? "UTC" } },
  });
  if (!values.email || !values.name) throw new Error('Usage: pnpm owner:create --email you@example.com --name "Your Name"');
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: values.timezone });
  } catch {
    throw new Error(`Unknown timezone: ${values.timezone}`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const password = process.env.OWNER_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
  const passwordHash = await hashPassword(password);
  const email = values.email.toLowerCase();

  const { db, close } = createDb(url);
  try {
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let id: string;
    if (existing) {
      await db.update(users).set({ passwordHash, displayName: values.name, timezone: values.timezone }).where(eq(users.id, existing.id));
      id = existing.id;
      console.log(`Updated owner ${email}`);
    } else {
      const [u] = await db.insert(users).values({ email, passwordHash, displayName: values.name, timezone: values.timezone! }).returning();
      id = u!.id;
      console.log(`Created owner ${email}`);
    }
    await seedUserDefaults(db, id, values.timezone);
    await audit(db, { userId: id, actor: "system", action: existing ? "auth.password_reset_cli" : "auth.owner_created" });
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
