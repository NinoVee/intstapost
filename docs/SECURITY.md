# Security & privacy model

This app processes personal photos and videos, including family and children. Privacy is a primary requirement.

## Principles

1. **AI creates, human approves.** No automatic publishing. Approvals bind to a content hash, so editing a
   draft after approval invalidates it. Only a human can move a draft to `approved`, `scheduled` or
   `published` (`assertTransition`).
2. **Originals are immutable.** They're write-once in storage and protected by a database trigger.
3. **Least data out.** Nothing leaves the server unless an operation needs it. Only the best
   near-duplicate representatives go to paid AI, downscaled and with metadata stripped. Training on your
   media is off unless `ALLOW_EXTERNAL_TRAINING=true` *and* the brand profile opts in.
4. **Identity first.** The Identity Preservation Guard blocks face swaps, facial-geometry changes,
   identity, ethnicity and skin-tone changes, and aging/de-aging, regardless of overrides. Major body edits
   need an explicit level-4 request and are labelled. Body edits are never applied to children, and child
   media is capped at colour-only edits.

## Controls implemented (Phase 1)

| Control | Implementation |
|---|---|
| Secrets | Env vars only, validated by zod at startup (`packages/core/src/env.ts`). `.env` is git-ignored. Never exposed to client components (`server-only`). |
| Credentials at rest | AES-256-GCM with the row ID as associated data (`encryptSecret`), so ciphertext can't be moved between rows. |
| Passwords | scrypt (N=16384, r=8, p=1), with constant-time comparison and a real dummy hash for unknown emails. |
| Sessions | 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` over https). Only its SHA-256 is stored. 30-day expiry. |
| App sessions | `POST /api/auth/login` returns a bearer token in the body (never a cookie). It uses the same sessions table, throttling and audit log as the web login. Logout revokes it server-side. The Apple app keeps it in the Keychain (device-only) and refuses plain http except on local networks. |
| AI agent keys | `isa_…` keys created in Settings (only SHA-256 stored). Scopes: read / organise / run jobs / view photos (off by default). **approve, reject, publish, upload and key management are human-only for every agent key** (`principalCan`). Agent keys can't open web pages or run server actions, are rate-limited (120/min), audited as actor `agent`, and revocable instantly. Without "view photos", photo URLs are stripped from all responses and `/api/media/file` refuses them. |
| Brute force | 5 failures per email+IP per 15 minutes (in-memory; single instance). |
| CSRF | Server Actions: Next.js origin check. Cookie-authenticated API mutations: explicit `Origin` must match `APP_URL`. Bearer-token requests carry no ambient credentials, so they need no origin check. Login accepts JSON only. |
| Media access | Private storage. `/api/media/file` requires **both** a valid session and an HMAC-signed, short-lived (default 300 s) URL bound to that user and key. Keys outside the user's namespace are refused. |
| Upload validation | Magic-byte type detection (never the filename or client MIME), size limit, allow-listed formats. |
| Path safety | Storage keys are validated. Folder imports are restricted to `MEDIA_IMPORT_ROOTS` with realpath checks, so symlink escapes are refused. |
| Location privacy | GPS is rounded to about 1 km before storage. Previews are re-encoded with all EXIF/GPS removed. Locations are never auto-added to captions. |
| Temp files | 0600 permissions, deleted in `finally`, plus the hourly `CleanupTemporaryMedia` job. |
| Audit log | Append-only `audit_logs` (database trigger). The only permitted update is anonymisation when a user is deleted. Logins, failures, ingest, approvals, rejections and exclusions are logged. |
| Logging | pino with redaction of password/token/secret/cookie/authorization fields. |
| HTTP headers | CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer, Permissions-Policy. |
| Network exposure | docker-compose binds every port to 127.0.0.1. Put a TLS reverse proxy (Caddy/nginx) or a VPN/Tailscale in front for remote access. |
| Containers | Non-root `node` user. Import folders are mounted read-only. |

## Family and children (§22)

- `family` and `kids` themes are marked sensitive. Drafts carry `contains_family` / `contains_children`
  flags and show a "review carefully" badge.
- Never added automatically: names, schools, addresses, routine locations, schedules, mentions or tags.
  Tag suggestions are suggestions only.
- People can be marked `exclude_from_content`, and assets can be marked "never use".

## Integrations

OAuth with minimal scopes. Tokens are encrypted in `integrations.encrypted_credentials` and are revocable
(`revoked_at`, `status`). Publishing scopes are requested only when you enable publishing.

## Known limitations / next steps

- Login throttling is per process. Move it to Redis for multi-instance deployments.
- Uploads are buffered in memory (fine for personal scale, up to `MAX_UPLOAD_MB`). Streaming to storage is planned.
- The pre-flight identity guard is pattern-based. The post-flight face-embedding comparison
  (original vs. edited) arrives with the Quality-Control agent in Phase 8.
