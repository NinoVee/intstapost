CREATE TYPE "public"."actor_kind" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped', 'budget_exceeded');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."caption_style" AS ENUM('minimal', 'confident', 'funny', 'professional', 'inspirational', 'luxury', 'personal', 'reflective');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('post', 'carousel', 'story', 'reel');--> statement-breakpoint
CREATE TYPE "public"."draft_kind" AS ENUM('internal', 'instagram_native');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('generating', 'ready_for_review', 'approved', 'scheduled', 'published', 'rejected', 'saved_for_later', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."edit_job_status" AS ENUM('queued', 'blocked', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."exclusion_kind" AS ENUM('asset', 'person', 'keyword', 'location', 'theme');--> statement-breakpoint
CREATE TYPE "public"."feedback_signal" AS ENUM('approved', 'rejected', 'edited', 'skipped', 'save_for_later');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('instagram', 'spotify', 'apple_music', 'soundcloud', 'google', 'dropbox', 'higgsfield', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('pending', 'active', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."media_provider_kind" AS ENUM('upload', 'local_folder', 'google_photos_picker', 'google_drive', 'dropbox', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('ingested', 'analyzing', 'analyzed', 'unusable', 'failed');--> statement-breakpoint
CREATE TYPE "public"."music_service" AS ENUM('spotify', 'apple_music', 'soundcloud', 'instagram_library');--> statement-breakpoint
CREATE TYPE "public"."person_relationship" AS ENUM('self', 'partner', 'family', 'child', 'friend', 'colleague', 'other');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_people" (
	"asset_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"confirmed_by_user" boolean DEFAULT false NOT NULL,
	CONSTRAINT "asset_people_asset_id_person_id_pk" PRIMARY KEY("asset_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "asset_themes" (
	"asset_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"source" text DEFAULT 'classifier' NOT NULL,
	CONSTRAINT "asset_themes_asset_id_theme_id_pk" PRIMARY KEY("asset_id","theme_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor" "actor_kind" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"learned" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"style" "caption_style" NOT NULL,
	"text" text NOT NULL,
	"emoji_variant" text,
	"edited_text" text,
	"selected" boolean DEFAULT false NOT NULL,
	"tag_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" "content_format" NOT NULL,
	"kind" "draft_kind" DEFAULT 'internal' NOT NULL,
	"status" "draft_status" DEFAULT 'generating' NOT NULL,
	"title" text,
	"primary_theme_id" uuid,
	"suggested_post_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"timeline" jsonb,
	"story_elements" jsonb,
	"posting_instructions" text,
	"location_suggestion" text,
	"contains_family" boolean DEFAULT false NOT NULL,
	"contains_children" boolean DEFAULT false NOT NULL,
	"ai_modified" boolean DEFAULT false NOT NULL,
	"ai_disclosure_labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"quality_score" smallint,
	"qc_report" jsonb,
	"content_hash" text,
	"agent_run_id" uuid,
	"external_media_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "exclusion_kind" NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" smallint DEFAULT 3 NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"music_moods" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"role" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"edit_version_id" uuid,
	"crop" jsonb,
	"trim_in_ms" integer,
	"trim_out_ms" integer,
	"overlay_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_secondary_themes" (
	"draft_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	CONSTRAINT "draft_secondary_themes_draft_id_theme_id_pk" PRIMARY KEY("draft_id","theme_id")
);
--> statement-breakpoint
CREATE TABLE "edit_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"draft_id" uuid,
	"provider" text NOT NULL,
	"operations" text[] NOT NULL,
	"requested_intensity" smallint NOT NULL,
	"effective_intensity" smallint,
	"prompt" text,
	"guard_result" jsonb,
	"status" "edit_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"provider_request_id" text,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"edit_job_id" uuid,
	"version_number" integer NOT NULL,
	"label" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"edl" jsonb NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"disclosure_labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid,
	"asset_id" uuid,
	"signal" "feedback_signal" NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"comment" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"selected" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_account_id" text,
	"display_name" text,
	"encrypted_credentials" text,
	"token_expires_at" timestamp with time zone,
	"last_error" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"analyzer" text NOT NULL,
	"analyzer_version" text NOT NULL,
	"sharpness" real,
	"brightness" real,
	"contrast" real,
	"clipped_highlights" real,
	"clipped_shadows" real,
	"is_blurry" boolean,
	"technical_score" smallint,
	"composition_score" smallint,
	"personal_relevance_score" smallint,
	"instagram_potential_score" smallint,
	"theme_match_score" smallint,
	"uniqueness_score" smallint,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid,
	"external_id" text,
	"kind" "media_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"original_filename" text,
	"original_storage_key" text NOT NULL,
	"preview_storage_key" text,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"captured_at" timestamp with time zone,
	"approx_latitude" real,
	"approx_longitude" real,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phash" text,
	"duplicate_cluster_id" uuid,
	"is_cluster_representative" boolean DEFAULT true NOT NULL,
	"status" "media_status" DEFAULT 'ingested' NOT NULL,
	"contains_people" boolean,
	"contains_children" boolean,
	"excluded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "media_provider_kind" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"integration_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"cursor" text,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"service" "music_service",
	"external_id" text,
	"theme_id" uuid,
	"weight" real DEFAULT 1 NOT NULL,
	"origin" text DEFAULT 'imported' NOT NULL,
	"signal_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"service" "music_service" NOT NULL,
	"track_id" text,
	"track_url" text,
	"match_score" smallint NOT NULL,
	"best_section_start_ms" integer,
	"best_section_end_ms" integer,
	"reason" text NOT NULL,
	"from_trends" boolean DEFAULT false NOT NULL,
	"user_choice" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"relationship" "person_relationship" DEFAULT 'other' NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"exclude_from_content" boolean DEFAULT false NOT NULL,
	"instagram_handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishing_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"integration_id" uuid,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"account_type" text NOT NULL,
	"external_account_id" text,
	"username" text,
	"publishing_enabled" boolean DEFAULT false NOT NULL,
	"native_drafts_supported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"cost_cents" integer NOT NULL,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source" text NOT NULL,
	"source_url" text,
	"score" real,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_people" ADD CONSTRAINT "asset_people_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_people" ADD CONSTRAINT "asset_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_themes" ADD CONSTRAINT "asset_themes_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_themes" ADD CONSTRAINT "asset_themes_theme_id_content_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."content_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captions" ADD CONSTRAINT "captions_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_primary_theme_id_content_themes_id_fk" FOREIGN KEY ("primary_theme_id") REFERENCES "public"."content_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_exclusions" ADD CONSTRAINT "content_exclusions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_themes" ADD CONSTRAINT "content_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_edit_version_id_edit_versions_id_fk" FOREIGN KEY ("edit_version_id") REFERENCES "public"."edit_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_secondary_themes" ADD CONSTRAINT "draft_secondary_themes_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_secondary_themes" ADD CONSTRAINT "draft_secondary_themes_theme_id_content_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."content_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_jobs" ADD CONSTRAINT "edit_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_jobs" ADD CONSTRAINT "edit_jobs_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_jobs" ADD CONSTRAINT "edit_jobs_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_versions" ADD CONSTRAINT "edit_versions_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_versions" ADD CONSTRAINT "edit_versions_edit_job_id_edit_jobs_id_fk" FOREIGN KEY ("edit_job_id") REFERENCES "public"."edit_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtags" ADD CONSTRAINT "hashtags_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_analysis" ADD CONSTRAINT "media_analysis_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_id_media_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."media_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_preferences" ADD CONSTRAINT "music_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_preferences" ADD CONSTRAINT "music_preferences_theme_id_content_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."content_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_recommendations" ADD CONSTRAINT "music_recommendations_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_targets" ADD CONSTRAINT "publishing_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_targets" ADD CONSTRAINT "publishing_targets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_kind_created_idx" ON "agent_runs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "approvals_draft_idx" ON "approvals" USING btree ("draft_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "captions_draft_idx" ON "captions" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "content_drafts_user_status_idx" ON "content_drafts" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_exclusions_uq" ON "content_exclusions" USING btree ("user_id","kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "content_themes_user_slug_uq" ON "content_themes" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_media_position_uq" ON "draft_media" USING btree ("draft_id","position");--> statement-breakpoint
CREATE INDEX "edit_jobs_asset_idx" ON "edit_jobs" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edit_versions_asset_number_uq" ON "edit_versions" USING btree ("asset_id","version_number");--> statement-breakpoint
CREATE INDEX "feedback_user_created_idx" ON "feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtags_draft_tag_uq" ON "hashtags" USING btree ("draft_id","tag");--> statement-breakpoint
CREATE INDEX "integrations_user_provider_idx" ON "integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "media_analysis_asset_idx" ON "media_analysis" USING btree ("asset_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_user_sha_uq" ON "media_assets" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE INDEX "media_assets_user_created_idx" ON "media_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_cluster_idx" ON "media_assets" USING btree ("duplicate_cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_source_external_uq" ON "media_assets" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_sources_user_name_uq" ON "media_sources" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "music_preferences_user_kind_idx" ON "music_preferences" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "music_recommendations_draft_idx" ON "music_recommendations" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_job_uq" ON "schedules" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spend_ledger_user_created_idx" ON "spend_ledger" USING btree ("user_id","created_at");