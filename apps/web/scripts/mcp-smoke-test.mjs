/**
 * Connects to the Content Studio MCP endpoint the way an AI agent (Meta Muse, Claude…) would,
 * and checks the safety guarantees. Read-only apart from toggling "never use" on and off again.
 *
 *   cd apps/web && node scripts/mcp-smoke-test.mjs https://your-server isa_yourAgentKey
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [base = "http://localhost:3000", key] = process.argv.slice(2);
if (!key) {
  console.error("Usage: node scripts/mcp-smoke-test.mjs <server-url> <agent-key>");
  process.exit(2);
}
const url = new URL("/api/mcp", base);
let failed = false;
const pass = (m) => console.log(`PASS ${m}`);
const fail = (m) => {
  console.log(`FAIL ${m}`);
  failed = true;
};
const connect = async (k) => {
  const c = new Client({ name: "content-studio-smoke-test", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: k ? { Authorization: `Bearer ${k}` } : {} } }));
  return c;
};
const text = (r) => {
  try {
    return JSON.parse(r.content[0].text);
  } catch {
    return r.content[0].text;
  }
};

try {
  await connect(null);
  fail("connected without a key");
} catch {
  pass("connection without a key is refused");
}

const c = await connect(key);
pass(`connected to ${c.getServerVersion()?.name}`);
const tools = (await c.listTools()).tools.map((t) => t.name);
pass(`tools: ${tools.join(", ")}`);
if (tools.some((t) => /approve|reject|publish|upload|post/.test(t))) fail("an approve/reject/publish/upload tool is exposed");
else pass("no tool can approve, reject, publish or upload");

const status = text(await c.callTool({ name: "studio_status", arguments: {} }));
pass(`permissions: ${status.yourPermissions} · photos: ${status.canViewPhotos} · publishing: ${status.publishingEnabled}`);
const today = text(await c.callTool({ name: "get_today", arguments: {} }));
pass(`${today.greeting} · ${today.draftsWaitingForReview} draft(s) waiting · ${today.mediaPipeline.total} in library`);
const leaked = today.drafts.some((d) => d.coverImageUrl) || false;
if (!status.canViewPhotos && leaked) fail("photo URLs returned to a key without the photo permission");
else pass("photo URLs only with the photo permission");

if (tools.includes("set_never_use")) {
  const media = text(await c.callTool({ name: "list_media", arguments: { filter: "all", limit: 1 } }));
  const item = media.items[0];
  if (item) {
    await c.callTool({ name: "set_never_use", arguments: { media_id: item.id, never_use: !item.neverUse } });
    await c.callTool({ name: "set_never_use", arguments: { media_id: item.id, never_use: item.neverUse } });
    pass("organise permission works (toggled never-use and restored it)");
  }
}

const res = await fetch(new URL("/api/today", base), { headers: { Authorization: `Bearer ${key}` } });
const draft = res.ok ? (await res.json()).drafts?.[0] : undefined;
if (draft) {
  const r = await fetch(new URL(`/api/drafts/${draft.id}/decision`, base), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  r.status === 403 ? pass("approving through the REST API is refused (403)") : fail(`approve returned ${r.status}`);
}
await c.close();
process.exit(failed ? 1 : 0);
