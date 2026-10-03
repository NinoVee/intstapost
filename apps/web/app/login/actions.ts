"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login } from "@/lib/auth";

const schema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(1024) });

export async function loginAction(_prev: { error?: string; email?: string } | undefined, form: FormData): Promise<{ error?: string; email?: string }> {
  const email = typeof form.get("email") === "string" ? String(form.get("email")).slice(0, 320) : "";
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", email };
  const r = await login(parsed.data.email, parsed.data.password);
  if (!r.ok) return { error: r.error, email };
  redirect("/");
}
