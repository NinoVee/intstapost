import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const mediaKind = pgEnum("media_kind", ["image", "video"]);
export const mediaStatus = pgEnum("media_status", ["ingested", "analyzing", "analyzed", "unusable", "failed"]);
export const mediaProviderKind = pgEnum("media_provider_kind", [
  "upload",
  "local_folder",
  "google_photos_picker",
  "google_drive",
  "dropbox",
  "instagram",
]);
export const integrationProvider = pgEnum("integration_provider", [
  "instagram",
  "spotify",
  "apple_music",
  "soundcloud",
  "google",
  "dropbox",
  "higgsfield",
  "anthropic",
]);
export const integrationStatus = pgEnum("integration_status", ["pending", "active", "expired", "revoked", "error"]);
export const contentFormat = pgEnum("content_format", ["post", "carousel", "story", "reel"]);
export const draftStatus = pgEnum("draft_status", [
  "generating",
  "ready_for_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "saved_for_later",
  "archived",
  "failed",
]);
/** INTERNAL = lives in this app. INSTAGRAM_NATIVE = only if Meta ever exposes a draft API. */
export const draftKind = pgEnum("draft_kind", ["internal", "instagram_native"]);
export const editJobStatus = pgEnum("edit_job_status", ["queued", "blocked", "running", "succeeded", "failed", "cancelled"]);
export const captionStyle = pgEnum("caption_style", [
  "minimal",
  "confident",
  "funny",
  "professional",
  "inspirational",
  "luxury",
  "personal",
  "reflective",
]);
export const musicService = pgEnum("music_service", ["spotify", "apple_music", "soundcloud", "instagram_library"]);
export const feedbackSignal = pgEnum("feedback_signal", ["approved", "rejected", "edited", "skipped", "save_for_later"]);
export const approvalDecision = pgEnum("approval_decision", ["approved", "revoked"]);
export const actorKind = pgEnum("actor_kind", ["user", "agent", "system"]);
export const agentRunStatus = pgEnum("agent_run_status", ["queued", "running", "succeeded", "failed", "skipped", "budget_exceeded"]);
export const exclusionKind = pgEnum("exclusion_kind", ["asset", "person", "keyword", "location", "theme"]);
export const personRelationship = pgEnum("person_relationship", ["self", "partner", "family", "child", "friend", "colleague", "other"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ identity & auth */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the session token; the raw token only lives in the httpOnly cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ integrations & sources */

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    status: integrationStatus("status").notNull().default("pending"),
    /** Only the scopes actually granted — keep minimal. */
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    externalAccountId: text("external_account_id"),
    displayName: text("display_name"),
    /** AES-256-GCM ciphertext (bound to the row id) of OAuth tokens / API keys. Never plaintext. */
    encryptedCredentials: text("encrypted_credentials"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("integrations_user_provider_idx").on(t.userId, t.provider)],
);

export const mediaSources = pgTable(
  "media_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaProviderKind("kind").notNull(),
    name: text("name").notNull(),
    /** Non-secret config (e.g. folder path). Secrets live in integrations. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
    cursor: text("cursor"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("media_sources_user_name_uq").on(t.userId, t.name)],
);

/* ------------------------------------------------------------------ people & exclusions */

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  relationship: personRelationship("relationship").notNull().default("other"),
  isMinor: boolean("is_minor").notNull().default(false),
  /** "Don't use this person in future posts." */
  excludeFromContent: boolean("exclude_from_content").notNull().default(false),
  /** Never auto-tag; this is a suggestion only and requires the person's handle be added by the user. */
  instagramHandle: text("instagram_handle"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contentExclusions = pgTable(
  "content_exclusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: exclusionKind("kind").notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("content_exclusions_uq").on(t.userId, t.kind, t.value)],
);

/* ------------------------------------------------------------------ media */

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => mediaSources.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    kind: mediaKind("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    originalFilename: text("original_filename"),
    /** Immutable original; never overwritten (§33). */
    originalStorageKey: text("original_storage_key").notNull(),
    /** Poster frame for videos / normalized preview for images (derived, regenerable). */
    previewStorageKey: text("preview_storage_key"),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    /** Rounded (~1 km) — precise location is never stored or surfaced in captions. */
    approxLatitude: real("approx_latitude"),
    approxLongitude: real("approx_longitude"),
    /** Sanitised technical metadata (camera, lens, codec, fps …). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** 64-bit perceptual hash as 16 hex chars. */
    phash: text("phash"),
    duplicateClusterId: uuid("duplicate_cluster_id"),
    isClusterRepresentative: boolean("is_cluster_representative").notNull().default(true),
    status: mediaStatus("status").notNull().default("ingested"),
    containsPeople: boolean("contains_people"),
    containsChildren: boolean("contains_children"),
    /** "Never use this picture." */
    excluded: boolean("excluded").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("media_assets_user_sha_uq").on(t.userId, t.sha256),
    index("media_assets_user_created_idx").on(t.userId, t.createdAt),
    index("media_assets_cluster_idx").on(t.duplicateClusterId),
    uniqueIndex("media_assets_source_external_uq").on(t.sourceId, t.externalId),
  ],
);

export const mediaAnalysis = pgTable(
  "media_analysis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    /** deterministic (local, free) | ai (paid vision model) */
    stage: text("stage").notNull(),
    analyzer: text("analyzer").notNull(),
    analyzerVersion: text("analyzer_version").notNull(),
    // Deterministic measurements
    sharpness: real("sharpness"),
    brightness: real("brightness"),
    contrast: real("contrast"),
    clippedHighlights: real("clipped_highlights"),
    clippedShadows: real("clipped_shadows"),
    isBlurry: boolean("is_blurry"),
    // Scores 0-100 (§18) — several, never a single overall score
    technicalScore: smallint("technical_score"),
    compositionScore: smallint("composition_score"),
    personalRelevanceScore: smallint("personal_relevance_score"),
    instagramPotentialScore: smallint("instagram_potential_score"),
    themeMatchScore: smallint("theme_match_score"),
    uniquenessScore: smallint("uniqueness_score"),
    /** people / environment / activities / clothing / objects / events / mood / sensitive. */
    labels: jsonb("labels").$type<Record<string, unknown>>().notNull().default({}),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("media_analysis_asset_idx").on(t.assetId, t.stage)],
);

export const assetPeople = pgTable(
  "asset_people",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    confirmedByUser: boolean("confirmed_by_user").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.personId] })],
);

/* ------------------------------------------------------------------ themes */

export const contentThemes = pgTable(
  "content_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Higher = preferred. */
    priority: smallint("priority").notNull().default(3),
    sensitive: boolean("sensitive").notNull().default(false),
    musicMoods: text("music_moods").array().notNull().default(sql`'{}'::text[]`),
    /** Preferred weekdays (0=Sun) — soft preference only. */
    preferredWeekdays: smallint("preferred_weekdays").array().notNull().default(sql`'{}'::smallint[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("content_themes_user_slug_uq").on(t.userId, t.slug)],
);

export const assetThemes = pgTable(
  "asset_themes",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id")
      .notNull()
      .references(() => contentThemes.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    source: text("source").notNull().default("classifier"),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.themeId] })],
);

/* ------------------------------------------------------------------ brand profile */

export const brandProfiles = pgTable("brand_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** User-editable settings, validated by brandProfileSchema in @intstapost/core. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  /** Preferences learned from feedback (kept separate so the user can reset them). */
  learned: jsonb("learned").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ agent runs & cost */

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** daily_media_scan | daily_content_generation | trend_refresh | cleanup_temp_media | manual_command | analyze_asset */
    kind: text("kind").notNull(),
    trigger: text("trigger").notNull().default("schedule"),
    status: agentRunStatus("status").notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    costCents: integer("cost_cents").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("agent_runs_kind_created_idx").on(t.kind, t.createdAt)],
);

export const spendLedger = pgTable(
  "spend_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    costCents: integer("cost_cents").notNull(),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("spend_ledger_user_created_idx").on(t.userId, t.createdAt)],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** DailyMediaScan | DailyContentGeneration | TrendRefresh | CleanupTemporaryMedia */
    jobName: text("job_name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("schedules_job_uq").on(t.jobName)],
);

/* ------------------------------------------------------------------ drafts */

export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    format: contentFormat("format").notNull(),
    kind: draftKind("kind").notNull().default("internal"),
    status: draftStatus("status").notNull().default("generating"),
    title: text("title"),
    primaryThemeId: uuid("primary_theme_id").references(() => contentThemes.id, { onDelete: "set null" }),
    suggestedPostAt: timestamp("suggested_post_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    /** Reel timeline / EDL: [{start,end,segment,draftMediaId}] (§16). */
    timeline: jsonb("timeline").$type<unknown[]>(),
    /** Story elements: text, sticker/poll/question suggestions — never auto-published. */
    storyElements: jsonb("story_elements").$type<unknown[]>(),
    postingInstructions: text("posting_instructions"),
    locationSuggestion: text("location_suggestion"),
    containsFamily: boolean("contains_family").notNull().default(false),
    containsChildren: boolean("contains_children").notNull().default(false),
    aiModified: boolean("ai_modified").notNull().default(false),
    /** Disclosure labels from the guard (ai_modified_clothing, creative_ai_scene …). */
    aiDisclosureLabels: text("ai_disclosure_labels").array().notNull().default(sql`'{}'::text[]`),
    qualityScore: smallint("quality_score"),
    qcReport: jsonb("qc_report").$type<Record<string, unknown>>(),
    /** sha256 over the publishable content; approvals bind to it. */
    contentHash: text("content_hash"),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    externalMediaId: text("external_media_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("content_drafts_user_status_idx").on(t.userId, t.status, t.createdAt)],
);

export const draftSecondaryThemes = pgTable(
  "draft_secondary_themes",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id")
      .notNull()
      .references(() => contentThemes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.draftId, t.themeId] })],
);

/* ------------------------------------------------------------------ edits (non-destructive) */

export const editJobs = pgTable(
  "edit_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => contentDrafts.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    operations: text("operations").array().notNull(),
    requestedIntensity: smallint("requested_intensity").notNull(),
    effectiveIntensity: smallint("effective_intensity"),
    prompt: text("prompt"),
    /** Full Identity Preservation Guard result, for audit. */
    guardResult: jsonb("guard_result").$type<Record<string, unknown>>(),
    status: editJobStatus("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    providerRequestId: text("provider_request_id"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("edit_jobs_asset_idx").on(t.assetId)],
);

export const editVersions = pgTable(
  "edit_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    parentVersionId: uuid("parent_version_id"),
    editJobId: uuid("edit_job_id").references(() => editJobs.id, { onDelete: "set null" }),
    versionNumber: integer("version_number").notNull(),
    label: text("label").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    /** Non-destructive edit decision list that reproduces this version from the original. */
    edl: jsonb("edl").$type<unknown>().notNull(),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    disclosureLabels: text("disclosure_labels").array().notNull().default(sql`'{}'::text[]`),
    isFinal: boolean("is_final").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("edit_versions_asset_number_uq").on(t.assetId, t.versionNumber)],
);

export const draftMedia = pgTable(
  "draft_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    /** cover | slide | clip | story_frame | hook | ending */
    role: text("role").notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    /** null = use the original */
    editVersionId: uuid("edit_version_id").references(() => editVersions.id, { onDelete: "set null" }),
    crop: jsonb("crop").$type<{ x: number; y: number; width: number; height: number; aspect: string }>(),
    trimInMs: integer("trim_in_ms"),
    trimOutMs: integer("trim_out_ms"),
    overlayText: text("overlay_text"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("draft_media_position_uq").on(t.draftId, t.position)],
);

/* ------------------------------------------------------------------ captions, hashtags, music */

export const captions = pgTable(
  "captions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    style: captionStyle("style").notNull(),
    text: text("text").notNull(),
    emojiVariant: text("emoji_variant"),
    /** The user's edited text, kept separate so we can learn from the diff. */
    editedText: text("edited_text"),
    selected: boolean("selected").notNull().default(false),
    /** Suggestions only — never auto-tagged. */
    tagSuggestions: jsonb("tag_suggestions").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("captions_draft_idx").on(t.draftId)],
);

export const hashtags = pgTable(
  "hashtags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    selected: boolean("selected").notNull().default(true),
  },
  (t) => [uniqueIndex("hashtags_draft_tag_uq").on(t.draftId, t.tag)],
);

export const musicPreferences = pgTable(
  "music_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** artist | genre | track | playlist */
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    service: musicService("service"),
    externalId: text("external_id"),
    /** Theme-specific association learned from selections (null = global). */
    themeId: uuid("theme_id").references(() => contentThemes.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1),
    /** imported | selected | rejected | skipped | manual */
    origin: text("origin").notNull().default("imported"),
    signalCount: integer("signal_count").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [index("music_preferences_user_kind_idx").on(t.userId, t.kind)],
);

export const musicRecommendations = pgTable(
  "music_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    rank: smallint("rank").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    service: musicService("service").notNull(),
    trackId: text("track_id"),
    /** Deep link to open the track in the service — never a download/stream URL. */
    trackUrl: text("track_url"),
    matchScore: smallint("match_score").notNull(),
    bestSectionStartMs: integer("best_section_start_ms"),
    bestSectionEndMs: integer("best_section_end_ms"),
    reason: text("reason").notNull(),
    fromTrends: boolean("from_trends").notNull().default(false),
    /** null = undecided */
    userChoice: text("user_choice"),
    createdAt: createdAt(),
  },
  (t) => [index("music_recommendations_draft_idx").on(t.draftId)],
);

/* ------------------------------------------------------------------ publishing, approvals, feedback */

export const publishingTargets = pgTable("publishing_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("instagram"),
  /** business | creator | personal — personal accounts cannot publish via the API. */
  accountType: text("account_type").notNull(),
  externalAccountId: text("external_account_id"),
  username: text("username"),
  /** Off by default. The user must turn this on explicitly. */
  publishingEnabled: boolean("publishing_enabled").notNull().default(false),
  /** Instagram's official API has no native-draft endpoint today. */
  nativeDraftsSupported: boolean("native_drafts_supported").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: approvalDecision("decision").notNull(),
    /** Content hash the human saw and approved. */
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_draft_idx").on(t.draftId, t.createdAt)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => contentDrafts.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    signal: feedbackSignal("signal").notNull(),
    reasons: text("reasons").array().notNull().default(sql`'{}'::text[]`),
    comment: text("comment"),
    /** Snapshot of the theme/format/caption-style/music so learning survives later edits. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_user_created_idx").on(t.userId, t.createdAt)],
);

export const trendSignals = pgTable("trend_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** reel_format | editing_style | caption_format | audio | fashion | fitness | travel | transition | structure */
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  /** Where it came from — must be an official/permitted source. */
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  score: real("score"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ audit */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actor: actorKind("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** Never contains secrets or media bytes. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_user_created_idx").on(t.userId, t.createdAt), index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);
