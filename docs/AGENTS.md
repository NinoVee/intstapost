# Connecting an AI agent (Meta Muse, Claude, …)

Content Studio exposes an **MCP server** at `https://<your-server>/api/mcp`. Any agent that speaks
the Model Context Protocol over Streamable HTTP can use it, including Meta Muse (via a custom connector)
and Claude.

> **The rule doesn't change: AI creates, you approve.** Agents can look, organise and start jobs.
> They can **never approve, reject, publish or upload**. The server refuses these for any agent key,
> whatever permissions it has. You still approve in the Content Studio app or website.

## What an agent can do

| Tool | Permission | What it does |
|---|---|---|
| `studio_status` | Read | What this key may do, whether publishing is on, the review link |
| `get_today` | Read | Greeting, drafts waiting for review, pipeline stats, recent jobs |
| `list_drafts` | Read | Drafts by status |
| `list_media` / `get_media` | Read | Library with quality scores (photo links only with **View photos**) |
| `set_never_use` | Organise | Mark a photo/video "never use", or allow it again |
| `save_draft_for_later` | Organise | Move a draft out of today's queue (reversible) |
| `run_job` | Run jobs | Start `DailyMediaScan`, `CleanupTemporaryMedia`, … now (no pile-up if already running) |

There is no approve, reject, publish, upload or post tool, and the REST API returns `403` if an agent
key tries those directly.

## Permissions

You choose them when you create the key (Settings → **AI agents**):

- **Read**: always on. Drafts, stats, scores and descriptions, **no photos**.
- **Organise**: never-use toggles and save-for-later.
- **Run jobs**: start studio jobs now.
- **View photos**: off by default. When on, the agent gets short-lived links to previews and
  originals. Leave it off unless you need it; it covers family and children's photos too.

Every agent action is in the audit log with actor `agent` and the key's ID. Keys are limited to
120 requests a minute, show when they were last used, and can be **revoked instantly** in Settings.
Only a hash of each key is stored, so a lost key can't be recovered: revoke it and make a new one.

## Step 1: make the server reachable over HTTPS

Muse runs in Meta's cloud, so it can't see `localhost` or your home Wi-Fi. Options:

- **Deploy** the server (see the Vercel discussion in the README: UI on Vercel, worker on Railway/Fly).
- **Expose your own computer safely** with an HTTPS tunnel such as Cloudflare Tunnel or Tailscale Funnel,
  pointing at port 3000. Only `/api/mcp` and the app need to be reachable, and everything still
  requires a key or login.

Set `APP_URL` in `.env` to that public `https://` address, so the MCP address and review links in
Settings are correct.

## Step 2: create a key

Content Studio → **Settings → AI agents** → name it "Meta Muse", choose permissions → **Create agent key**.
Copy the key (`isa_…`). It's shown once.

## Step 3: connect Meta Muse

Meta Muse doesn't (as of October 2026) have a settings screen for adding MCP servers. You ask it in
chat to create a **custom connector**, and it writes and runs the connector on its own secure VM. Meta's
connector details come from launch coverage, so expect the exact wording to change. A prompt that
works well:

> Create a custom connector called **Content Studio**. It's an MCP server using Streamable HTTP at
> `https://YOUR-SERVER/api/mcp`. Authenticate every request with the header
> `Authorization: Bearer isa_YOUR_KEY`. Store the key securely and never show it in chat.
> Read the server's instructions: you may look at drafts and media, organise, and start jobs, but you
> must never approve, reject, publish or post anything, and never log into my Instagram. When drafts
> are ready, tell me and give me the review link.

Then try:

- "What's waiting for me in Content Studio today?"
- "Scan for new photos now."
- "Never use the blurry gym photos from this week."
- "Save the travel carousel for next weekend."
- "Every morning at 8, tell me how many drafts are ready and link me to review them."

**Don't** give Muse your Instagram password or ask it to post. It can drive a browser, which would
skip your approval and may get your account flagged. Post from the Instagram app yourself.

## Claude and other MCP clients

Any MCP client that supports Streamable HTTP plus custom headers works. For example, Claude Code:

```bash
claude mcp add --transport http content-studio https://YOUR-SERVER/api/mcp \
  --header "Authorization: Bearer isa_YOUR_KEY"
```

## Checking it works

```bash
cd apps/web && node scripts/mcp-smoke-test.mjs https://YOUR-SERVER isa_YOUR_KEY
```

This connects like an agent, lists the tools, confirms there's no approve/publish tool, confirms
photo links only appear with **View photos**, and confirms that approving a draft with the key is refused.
