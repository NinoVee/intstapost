"use client";

import { useActionState, useState } from "react";
import { createAgentKeyAction, type CreateKeyState } from "@/app/(app)/actions";

export interface ScopeOption {
  value: string;
  label: string;
  description: string;
}

export function AgentKeyForm({ scopes, mcpUrl }: { scopes: ScopeOption[]; mcpUrl: string }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createAgentKeyAction, undefined);
  const [copied, setCopied] = useState(false);

  if (state?.key) {
    return (
      <div className="card" style={{ background: "var(--warn-bg)" }}>
        <p style={{ marginTop: 0, fontWeight: 700 }}>Key for “{state.name}” — copy it now. It won&apos;t be shown again.</p>
        <code id="new-agent-key" style={{ display: "block", overflowWrap: "anywhere", padding: 10, background: "var(--surface)", borderRadius: 8 }}>{state.key}</code>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            className="btn small primary"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.key!);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <a className="btn small" href="/settings">Done</a>
        </div>
        <p className="small" style={{ marginBottom: 0 }}>
          Give your agent the MCP address <code>{mcpUrl}</code> and this key as a bearer token (<code>Authorization: Bearer …</code>).
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="agent-name">Name</label>
        <input id="agent-name" name="name" type="text" placeholder="Meta Muse" required maxLength={60} />
      </div>
      <div className="reasons" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        {scopes.map((s) => (
          <label key={s.value} title={s.description}>
            <input type="checkbox" name="scopes" value={s.value} defaultChecked={s.value === "read" || s.value === "organize" || s.value === "jobs"} disabled={s.value === "read"} />
            <strong>{s.label}</strong> <span className="muted">— {s.description}</span>
          </label>
        ))}
      </div>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create agent key"}
      </button>
    </form>
  );
}
