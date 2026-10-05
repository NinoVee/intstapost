import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DRAFT_STATUSES, SCHEDULED_JOBS, principalCan, type AgentScope, type Capability } from "@intstapost/core";
import { and, audit, eq, mediaAssets, saveDraftForLater } from "@intstapost/db";
import type { Auth } from "./auth";
import { greeting } from "./format";
import { actorOf } from "./http";
import { JOB_DESCRIPTIONS, startJobNow } from "./jobs";
import { ACTIVE_DRAFT_STATUSES, getAssetDetail, listDrafts, listMedia, MEDIA_FILTERS, pipelineStats, recentAgentRuns, type DraftSummary } from "./queries";
import { db, env } from "./server";

/**
 * MCP server for external AI agents (Meta Muse, Claude, …), served over Streamable HTTP at
 * /api/mcp. Tools are registered only for the capabilities the caller's key holds, and there is
 * deliberately NO tool to approve, reject, publish or upload: those stay with the human.
 */

const INSTRUCTIONS = `You are connected to the user's private Content Studio, which prepares Instagram drafts from their own photos and videos.
Rules you must follow:
- You can look at drafts and media, organise the library and start jobs (if this key allows it).
- You CANNOT approve, reject, publish or post anything. Only the user can, in the Content Studio app or website. When a draft is ready, tell the user and give them the review link.
- Never post to Instagram, log into Instagram, or ask for the user's Instagram password.
- Drafts flagged containsFamily/containsChildren need the user's careful review; never share details about children (names, schools, locations).
- Music is a recommendation only; the user adds songs inside Instagram.`;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const json = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

export function buildMcpServer(auth: Auth): McpServer {
  const server = new McpServer({ name: "content-studio", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const can = (c: Capability) => principalCan(auth.principal, c);
  const userId = auth.user.id;
  const seeMedia = can("media");
  const appUrl = env().APP_URL;
  const abs = (path: string | null | undefined) => (path && seeMedia ? new URL(path, appUrl).toString() : undefined);
  const reviewUrl = new URL("/", appUrl).toString();
  const scopes: readonly AgentScope[] | "all" = auth.principal.kind === "agent" ? auth.principal.scopes : "all";

  const draftView = (d: DraftSummary) => ({
    id: d.id,
    format: d.format,
    status: d.status,
    theme: d.theme,
    qualityScore: d.qualityScore,
    slides: d.slides,
    aiModified: d.aiModified,
    containsFamily: d.containsFamily,
    containsChildren: d.containsChildren,
    createdAt: d.createdAt,
    coverImageUrl: abs(d.coverUrl),
    reviewUrl,
  });

  const audited = async (action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) => {
    const by = actorOf(auth);
    await audit(db(), { userId, actor: by.actor, action, entityType, entityId, metadata: { ...metadata, via: "mcp", agentKeyId: by.agentKeyId } });
  };

  /* ---------------- read ---------------- */

  server.registerTool(
    "studio_status",
    {
      title: "Studio status",
      description: "What this connection may do, whether publishing is enabled, and where the user reviews drafts.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      json({
        owner: auth.user.displayName,
        publishingEnabled: env().PUBLISHING_ENABLED,
        yourPermissions: scopes,
        canViewPhotos: seeMedia,
        neverAllowed: ["approve drafts", "reject drafts", "publish or post", "upload media", "manage keys"],
        reviewUrl,
        rule: "AI creates. The human approves.",
      }),
  );

  server.registerTool(
    "get_today",
    {
      title: "Today's content",
      description: "Greeting, drafts waiting for review, media-pipeline stats and recent studio jobs.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [drafts, stats, runs] = await Promise.all([listDrafts(userId, [...ACTIVE_DRAFT_STATUSES]), pipelineStats(userId), recentAgentRuns(5)]);
      return json({
        greeting: `${greeting(auth.user.timezone)}, ${auth.user.displayName.split(" ")[0]}`,
        draftsWaitingForReview: drafts.filter((d) => d.status === "ready_for_review").length,
        drafts: drafts.map(draftView),
        mediaPipeline: stats,
        recentJobs: runs.map((r) => ({ job: r.kind, status: r.status, at: r.createdAt, summary: r.error ?? r.output.summary ?? null })),
        reviewUrl,
      });
    },
  );

  server.registerTool(
    "list_drafts",
    {
      title: "List drafts",
      description: "Drafts by status (default: ready_for_review).",
      inputSchema: {
        status: z.enum(DRAFT_STATUSES).default("ready_for_review").describe("Draft status to list"),
        limit: z.number().int().min(1).max(50).default(12),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }) => json({ drafts: (await listDrafts(userId, [status], limit)).map(draftView) }),
  );

  server.registerTool(
    "list_media",
    {
      title: "List media",
      description: `Recent photos/videos with quality scores. Filters: ${Object.entries(MEDIA_FILTERS)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ")}.${seeMedia ? "" : " Image URLs are not included for this key."}`,
      inputSchema: {
        filter: z.enum(Object.keys(MEDIA_FILTERS) as [keyof typeof MEDIA_FILTERS, ...Array<keyof typeof MEDIA_FILTERS>]).default("best"),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, limit }) => {
      const items = await listMedia(userId, filter, { limit });
      return json({
        items: items.map((i) => ({
          id: i.id,
          kind: i.kind,
          status: i.status,
          technicalScore: i.technicalScore,
          blurry: i.isBlurry,
          nearDuplicate: !i.isRepresentative,
          neverUse: i.excluded,
          durationMs: i.durationMs,
          addedAt: i.createdAt,
          previewUrl: abs(i.previewUrl),
        })),
      });
    },
  );

  server.registerTool(
    "get_media",
    {
      title: "Media details",
      description: "Scores, size, capture date and similar shots for one photo or video.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const d = await getAssetDetail(userId, id);
      if (!d) return fail("No media with that id.");
      const a = d.asset;
      return json({
        id: a.id,
        kind: a.kind,
        status: a.status,
        filename: a.originalFilename,
        width: a.width,
        height: a.height,
        durationMs: a.durationMs,
        capturedAt: a.capturedAt,
        neverUse: a.excluded,
        blurry: d.deterministic?.isBlurry ?? null,
        scores: d.scores,
        similarShots: d.similar.map((s) => ({ id: s.id, best: s.isRepresentative })),
        previewUrl: abs(d.previewUrl),
      });
    },
  );

  /* ---------------- organize ---------------- */

  if (can("organize")) {
    server.registerTool(
      "set_never_use",
      {
        title: "Never use / allow media",
        description: "Mark a photo or video as never to be used in content (or allow it again). Reversible.",
        inputSchema: { media_id: z.string().uuid(), never_use: z.boolean() },
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      async ({ media_id, never_use }) => {
        const r = await db()
          .update(mediaAssets)
          .set({ excluded: never_use })
          .where(and(eq(mediaAssets.id, media_id), eq(mediaAssets.userId, userId)))
          .returning({ id: mediaAssets.id });
        if (!r.length) return fail("No media with that id.");
        await audited(never_use ? "media.excluded" : "media.included", "media_asset", media_id);
        return json({ ok: true, mediaId: media_id, neverUse: never_use });
      },
    );

    server.registerTool(
      "save_draft_for_later",
      {
        title: "Save draft for later",
        description: "Move a draft out of today's review queue to Saved for later. Reversible; does not approve or publish.",
        inputSchema: { draft_id: z.string().uuid() },
        annotations: { destructiveHint: false },
      },
      async ({ draft_id }) => {
        try {
          await saveDraftForLater(db(), userId, draft_id, null, actorOf(auth));
          return json({ ok: true, draftId: draft_id, status: "saved_for_later" });
        } catch (err) {
          return fail(err instanceof Error ? err.message : "Could not save the draft for later.");
        }
      },
    );
  }

  /* ---------------- jobs ---------------- */

  if (can("jobs")) {
    server.registerTool(
      "run_job",
      {
        title: "Run a studio job now",
        description: `Start a job immediately: ${SCHEDULED_JOBS.map((j) => `${j} (${JOB_DESCRIPTIONS[j]})`).join("; ")}. Never publishes anything.`,
        inputSchema: { job: z.enum(SCHEDULED_JOBS) },
      },
      async ({ job }) => {
        const r = await startJobNow(job);
        await audited("job.started", "job", job, r);
        return json({ job, ...r, message: r.queued ? `${job} started.` : `${job} is already queued or running.` });
      },
    );
  }

  return server;
}
