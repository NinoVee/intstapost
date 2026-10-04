# Architecture

> **Central rule: AI CREATES. HUMAN APPROVES.** The system may analyse, edit, generate, organise,
> recommend and prepare drafts. It never publishes without an explicit human approval of the exact
> content, and publishing is globally off by default.

## Pipeline

```
Raw media ─▶ Intake ─▶ Deterministic analysis ─▶ Near-duplicate clustering ─▶ Candidate selection
                │            (free, local)              (pHash)                      │
                │                                                                    ▼
                │                                                    AI analysis (paid, budgeted, best picks only)
                │                                                                    │
                ▼                                                                    ▼
        immutable original                                   Theme ─▶ Strategist ─▶ Photo/Video editor ─▶ Music ─▶ Caption
        (write-once storage)                                                                    │
                                                                                                ▼
                                                     Quality control ─▶ Draft builder ─▶ HUMAN APPROVAL ─▶ (optional) publish
```

Cheap work happens before expensive work (§20): metadata → exact dedupe (sha256) → quality metrics →
near-duplicate clustering → only cluster representatives continue to paid AI.

## Modules (not one giant prompt)

| Module | Kind | Where | Status |
|---|---|---|---|
| Media Intake | deterministic | `packages/media/src/intake` | ✅ Phase 1 |
| Media Analysis (stage 1: sharpness, exposure, pHash, ffprobe) | deterministic | `packages/media/src/analysis` | ✅ Phase 1 |
| Duplicate detection / clustering | deterministic | `packages/media/src/analysis/dedupe.ts` | ✅ Phase 1 |
| Media Analysis (stage 2: people, scene, clothing, events) | AI (`VisionAnalyzer`) | — | Phase 5 |
| Theme Agent | AI + rules | — | Phase 6 |
| Content Strategist / Draft engine | rules + AI | — | Phase 7 |
| Photo / Video Editor | `MediaEditor` providers (Sharp/FFmpeg deterministic, Higgsfield generative) | — | Phases 8–9 |
| Identity Preservation Guard | deterministic | `packages/core/src/policy/identity-guard.ts` | ✅ Phase 1 |
| Music Agent | `MusicProvider` (recommendation only) | — | Phase 10 |
| Caption Agent | AI (`TextGenerator`) | — | Phase 7 |
| Quality-Control Agent | deterministic + AI | — | Phase 8 |
| Approval gate | deterministic | `packages/core/src/policy/approval.ts`, `packages/db/src/services/drafts.ts` | ✅ Phase 1 |
| Publishing | `PublishingTarget` (Instagram Graph API) | — | Phase 11 |
| Scheduler | BullMQ job schedulers from `schedules` table | `apps/worker` | ✅ Phase 1 |

## Provider abstractions

All vendors sit behind interfaces in `packages/core/src/providers`, so a vendor can be swapped without
touching the content engine:

- **`MediaProvider`**: sources of media (`upload`, `local_folder` today; Google Photos Picker, Drive,
  Dropbox, Instagram later). See `packages/media/src/providers/registry.ts`.
- **`MediaEditor`**: `edit()` accepts only a `GuardedEditRequest`, a branded type that only
  `IdentityPreservationGuard.check()` can produce. Nothing reaches an image/video model without passing the guard.
- **`MusicProvider`**: taste signals and search. It deliberately has **no** method returning audio.
- **`PublishingTarget`**: `publish()` requires a `PublishAuthorization`, which only `authorizePublish()`
  can produce, and only when the global switch is on, the account allows publishing, and the latest human
  approval matches the current content hash.
- **`VisionAnalyzer` / `TextGenerator`**: model-agnostic AI with per-call cost reporting.

## Non-destructive workflow (§33)

- Originals are content-addressed (`originals/<user>/<sha[0:2]>/<sha>.<ext>`) and written with
  exclusive-create semantics (`O_EXCL` locally, `If-None-Match: *` on S3). Storage drivers refuse to
  overwrite or delete anything under `originals/`.
- A Postgres trigger refuses any change to `media_assets.original_storage_key/sha256/size_bytes`.
- Edits become new rows in `edit_versions` (also trigger-protected) with an EDL that reproduces them
  from the original. `draft_media.edit_version_id = NULL` means "use the original", so reverting is one update.

## Repository layout

```
apps/
  web/        Next.js 16 (App Router) dashboard + API routes (upload, signed media, health)
  worker/     BullMQ workers (analysis queue, scheduled agent jobs) + run-job CLI
  apple/      SwiftUI app for iPhone, iPad and Mac (client of the JSON API, bearer-token auth)
packages/
  core/       env validation, logger, crypto, policies (approval, identity guard), provider interfaces, themes, brand profile
  db/         Drizzle schema, SQL migrations, draft-decision service, test DB helper
  media/      storage drivers, signed URLs, intake, deterministic analysis, media providers
docker/       multi-target Dockerfile (web | worker)
docs/         this documentation
scripts/      create-owner CLI
```

## Runtime

- **web**: Next.js standalone server. Server components read Postgres directly. Uploads are ingested
  synchronously (hash, store, insert) and analysis is queued.
- **JSON API** (`/api/auth/*`, `/api/me`, `/api/today`, `/api/drafts/{id}/decision`, `/api/media*`):
  used by the Apple app. It shares its queries (`apps/web/lib/queries.ts`) and draft-decision service with
  the web pages, so both clients enforce identical rules.
- **worker**: consumes `media-intake` (per-asset analysis, concurrency 2) and `agent` (scheduled jobs,
  concurrency 1). Every scheduled run is recorded in `agent_runs`. Jobs that aren't built yet record
  `skipped` honestly instead of pretending to succeed.
- **Postgres 16**, **Redis 7**, and **local disk or any S3-compatible private bucket**.
