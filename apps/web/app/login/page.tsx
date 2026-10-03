import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <p className="eyebrow">Content Studio</p>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Sign in</h1>
        <p className="muted small" style={{ marginTop: 0, marginBottom: 20 }}>
          Your private studio. AI creates, you approve.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
