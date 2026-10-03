# Integration strategy

Verified against current public information in **October 2026**. Rule: official APIs, OAuth, SDKs or
user-provided files only. No scraping, browser automation, cookies, or private APIs. Where something
isn't possible through an official API, this document says so, and the code has an interface ready.

Note: the build sandbox's network policy blocked `docs.higgsfield.ai` and `developers.facebook.com`, so
some details below come from official SDK source and secondary documentation. **Re-check them against
the primary docs before implementing each phase.**

## Instagram / Meta (Phase 11)

| Capability | Official API? | Notes |
|---|---|---|
| Publish single image / video feed post | ✅ | Instagram Graph API container flow: `POST /{ig-user-id}/media` then `POST /{ig-user-id}/media_publish` |
| Carousel | ✅ | Up to 10 child containers |
| Story | ✅ | `media_type=STORIES`; disappears after 24 h |
| Reel | ✅ | `media_type=REELS`; API-published Reels limited to ~5–90 s, 9:16 |
| Rate limit | — | Query `content_publishing_limit`; currently reported as 100 API posts / 24 h |
| **Native draft in the Instagram app** | ❌ | **No endpoint exists.** All drafts are **INTERNAL drafts** (`content_drafts.kind = 'internal'`). The `instagram_native` enum value is reserved in case Meta ever adds one. |
| Account type | — | Business or Creator account linked to the app. Personal accounts cannot publish via API. |
| Licensed music on Reels | ⚠️ | Meta documents an "Instagram Audio API". Per your instructions, **music is never attached automatically**: you add the song in Instagram at posting time. |
| Interactive stickers (polls, questions), mentions, tags | ❌ / not used | Stored only as suggestions on the draft; you add them in the app. |

Publishing requires: `PUBLISHING_ENABLED=true` **and** `publishing_targets.publishing_enabled=true`
**and** a human approval whose content hash equals the current draft hash.

## Higgsfield (Phase 9)

- Official API base `https://api.higgsfield.ai`. Auth header `Authorization: Key <KEY_ID>:<KEY_SECRET>`,
  with credentials created in the Higgsfield console.
- Async model: submit a generation request, then poll `/requests/{request_id}/status` or receive a webhook.
- Official Node SDK: `@higgsfield/client` (`subscribe(endpoint, options)`, uploads, webhooks).
- **Still required from you:** API credentials, plus the **model endpoint** to use for identity-preserving
  image edits and for video. These go in `HIGGSFIELD_IMAGE_EDIT_ENDPOINT` / `HIGGSFIELD_VIDEO_ENDPOINT`
  and are never hard-coded. Also confirm Higgsfield's data-retention and training terms. `MediaEditor.capabilities.retainsInputs`
  must be `false` unless you opt in.
- Credentials are server-side only, as Higgsfield's own docs require.

## Music: recommendation only (Phase 10)

Spotify, Apple Music and SoundCloud are **taste and discovery sources, never media sources**. Nothing
is downloaded, ripped, embedded or attached. A recommendation stores song, artist, service, track
ID/URL (a deep link), suggested section, match score and reason.

| Service | What's available | Caveats |
|---|---|---|
| Spotify Web API | OAuth (PKCE): top artists/tracks, saved tracks, playlists, recently played, search | `audio-features`, `audio-analysis`, `recommendations`, related artists: **removed for new apps (Nov 2024)**. Feb/Mar 2026 Development Mode: Premium owner, 1 client ID, ≤5 users, reduced endpoint set, search `limit` ≤10. Fine for a personal app. Mood/energy must come from our own heuristics (genres, artist/track metadata, your past choices). |
| Apple Music API | Developer token (JWT, ≤180 days) + Music-User-Token via MusicKit JS: library, recently played, heavy rotation, catalog search, charts | Needs an Apple Developer membership and a MusicKit key |
| SoundCloud API | OAuth 2.1 + PKCE: likes, playlists, followings, search | **New apps must apply and be approved** before getting credentials |
| Trending music | Spotify/Apple charts endpoints where available | Kept separate from your taste. The engine looks for overlap. |

## Media sources

| Source | Status | Mechanism |
|---|---|---|
| Uploads (desktop/phone browser) | ✅ Phase 1 | `POST /api/media/upload` |
| Local folders / camera imports | ✅ Phase 1 | `LocalFolderProvider`, restricted to `MEDIA_IMPORT_ROOTS`, read-only |
| **iCloud Photos** | ⚠️ no public API | Use iCloud for Windows/macOS Photos export or a synced folder mounted into `MEDIA_IMPORT_ROOTS` |
| Google Photos | Planned | **Picker API** only (you pick items). Since 2025-03-31 the Library API can only read app-created media. |
| Google Drive | Planned | Drive API v3, `drive.file` scope on a chosen folder |
| Dropbox | Planned | API v2, app-folder access |
| Instagram (your own media) | Planned | Graph API `/{ig-user-id}/media` |

## AI providers (Phase 5+)

Behind `VisionAnalyzer` / `TextGenerator`. Only cluster representatives that pass deterministic quality
checks are sent, downscaled, with EXIF stripped, and within `AI_DAILY_BUDGET_CENTS` / `AI_MONTHLY_BUDGET_CENTS`.

## Trend engine (Phase 13, optional)

Only official sources (platform charts, Meta's published creator resources, licensed trend data).
No scraping of Instagram or TikTok. Trend signals are stored in `trend_signals` with their source URL.
