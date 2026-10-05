/**
 * Who may do what (§34: AI CREATES. HUMAN APPROVES.)
 *
 * A request is made either by the human owner (web session / Apple app token) or by an
 * external AI agent (e.g. Meta Muse, Claude) using a scoped agent key. Agent keys can never be
 * granted the human-only capabilities, whatever scopes they hold.
 */
export const AGENT_SCOPES = ["read", "organize", "jobs", "media"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCOPE_INFO: Record<AgentScope, { label: string; description: string }> = {
  read: { label: "Read", description: "See drafts, stats, media scores and descriptions (no photos)." },
  organize: { label: "Organise", description: "Save drafts for later; mark media as never use / allow again." },
  jobs: { label: "Run jobs", description: "Start a media scan or other studio jobs now." },
  media: { label: "View photos", description: "Download previews and originals. Off by default — includes family and children." },
};

export type Capability =
  | "read"
  | "organize"
  | "jobs"
  | "media"
  | "upload"
  | "approve"
  | "reject"
  | "publish"
  | "manage_keys";

/** Never available to an agent key. */
export const HUMAN_ONLY_CAPABILITIES: readonly Capability[] = ["approve", "reject", "publish", "manage_keys", "upload"];

export type Principal = { kind: "user" } | { kind: "agent"; keyId: string; name: string; scopes: readonly AgentScope[] };

export function principalCan(p: Principal, cap: Capability): boolean {
  if (p.kind === "user") return true;
  if (HUMAN_ONLY_CAPABILITIES.includes(cap)) return false;
  return (p.scopes as readonly string[]).includes(cap);
}

/** Normalises requested scopes: always includes "read", drops unknown values. */
export function normalizeScopes(input: readonly string[]): AgentScope[] {
  const set = new Set<AgentScope>(["read"]);
  for (const s of input) if ((AGENT_SCOPES as readonly string[]).includes(s)) set.add(s as AgentScope);
  return AGENT_SCOPES.filter((s) => set.has(s));
}

export const AGENT_KEY_PREFIX = "isa_";

export function isAgentKey(token: string): boolean {
  return token.startsWith(AGENT_KEY_PREFIX);
}

export function denialMessage(cap: Capability): string {
  if (cap === "approve" || cap === "reject" || cap === "publish")
    return "Only you can approve, reject or publish. Open Content Studio (app or website) to review this draft.";
  if (cap === "upload") return "Agents can't upload media. Add photos from the Content Studio app or website.";
  if (cap === "manage_keys") return "Agent keys can only be managed by you in Settings.";
  return `This agent key doesn't have the "${cap}" permission. You can change it in Content Studio → Settings → AI agents.`;
}
