# Phased implementation plan

Each phase ends with: run the app → run tests → fix → verify → commit.

| # | Phase | Status | Contents |
|---|---|---|---|
| 1 | **Foundation**: architecture, schema, auth, upload/storage, deterministic analysis, scheduling, Docker | ✅ done | Steps 1–4 of the brief plus the cheap first half of step 5. See below. |
| 5 | AI media analysis | next | `VisionAnalyzer` implementation; people/children detection (sets `contains_people` / `contains_children`); scene, activity, clothing, event labels; composition, relevance and Instagram-potential scores; sensitive-info detection (addresses, school logos, plates). Representatives only, budgeted via `spend_ledger`. |
| 6 | Theme classification | | Primary and secondary themes per asset (`asset_themes`); groups related media by time, place and visuals. |
| 7 | Draft engine | | Content Strategist: chooses Post/Carousel/Story/Reel, theme rotation (soft weekly rhythm), `DailyContentGeneration`; Caption Agent (3–8 styles, hashtags, location suggestion, tag *suggestions*); manual commands ("Make today's content", "Create a Gym Reel from yesterday", …). |
| 8 | Photo/video processing | | `SharpEditor` / `FFmpegEditor` (crop 9:16, 4:5, 1:1, reframe, exposure, grade, stabilise, trim, speed ramp, subtitles, covers); Reel timeline EDL (hook → development → best moment → ending); Story sequences; Carousel ordering; **Quality-Control agent** including face-embedding identity check, dimensions, private-info scan, retry within budget. |
| 9 | Higgsfield | | `HiggsfieldEditor` via the official SDK once credentials and model endpoints are provided; only reachable with a `GuardedEditRequest`. |
| 10 | Music engine | | Spotify / Apple Music / SoundCloud OAuth; `music_preferences` from taste signals; 3–5 recommendations per draft with best section and reason; trending vs. personal overlap; "Open in …" deep links only. |
| 11 | Instagram | | Meta OAuth (Business/Creator), `publishing_targets`; export/download pack (media + caption + posting instructions); optional publishing behind the approval gate. |
| 12 | Review dashboard & calendar | | Original vs. edited comparison, everything editable before approval, Today/Tomorrow/This week/Scheduled/Drafts/Approved/Rejected/Archived. |
| 13 | Scheduling & trends | | Schedule editor UI; optional Trend Engine from official sources only. |
| 14 | Feedback learning | | Brand-profile editor; learn from approve/reject/edit/skip/save-for-later and rejection reasons; caption diff learning; theme↔music associations. |
| 15 | Privacy controls | | Integration revoke UI, data export, delete-my-data, Redis-backed rate limiting, streaming uploads. |
| 16–18 | Tests, deployment, docs | ongoing | Grown every phase. |

## Phase 1 deliverables (done)

- pnpm monorepo, TypeScript strict (`noUncheckedIndexedAccess`), zod-validated env.
- Database: 29 tables covering every entity in the brief, plus SQL triggers for immutable originals,
  immutable edit versions and an append-only audit log.
- Auth: owner account via CLI, scrypt, hashed DB sessions, throttling, CSRF checks.
- Storage: local and S3 drivers, write-once originals, signed short-lived media URLs.
- Intake: uploads plus allow-listed local folders; exact dedupe (sha256); magic-byte validation.
- Deterministic analysis: EXIF (GPS coarsened), sharpness (Laplacian variance), exposure and clipping,
  64-bit DCT pHash, ffprobe and frame sampling for video, HEIC support, technical score, usability
  flags, near-duplicate clustering that keeps the best 3 per cluster.
- Safety core: Identity Preservation Guard, edit-intensity scale and operation catalogue, approval gate
  with content-hash binding, draft state machine, spend guard.
- Worker: BullMQ analysis queue, DB-configured cron schedules (DailyMediaScan,
  DailyContentGeneration, TrendRefresh, CleanupTemporaryMedia), `agent_runs` history.
- Web: Today dashboard (greeting, draft cards with Approve/Reject-with-reasons/Save-for-later, pipeline
  stats, agent runs), Library (drag-drop upload, filters, scores, badges), asset detail ("Never use this",
  similar shots), Settings (safety, theme management, integration status, schedules, brand profile).
- Docker (web + worker targets), docker-compose (Postgres, Redis, optional MinIO, migrate), CI workflow.
- Tests: 72 (unit + Postgres integration), plus a Playwright end-to-end pass against the production build.
