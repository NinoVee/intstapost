# Content Studio: personal AI Instagram content agent

Your private content studio. It takes the photos and videos you make available, picks the strongest
media, and (as later phases land) edits it, groups it into themes, writes captions, recommends music and
prepares Posts, Stories, Reels and Carousels for you to review.

**AI creates. You approve.** Nothing is ever posted automatically. Every draft is an *internal* draft,
because Instagram's API has no native-draft endpoint. Music is recommended only: you add the song in
Instagram yourself.

> Status: **Phase 1 (foundation) is complete.** See [docs/ROADMAP.md](docs/ROADMAP.md) for what works today and what comes next.

## Quick start (local)

Requirements: Node 22, pnpm 10, PostgreSQL 16, Redis 7, FFmpeg.

```bash
pnpm install
cp .env.example .env
# fill APP_SECRET (openssl rand -base64 48) and ENCRYPTION_KEY (openssl rand -base64 32)
pnpm db:migrate
pnpm owner:create --email you@example.com --name "Your Name" --timezone America/New_York
cp .env apps/web/.env.local   # Next.js reads env from its own folder
pnpm dev                      # web on :3000 + worker
```

Open http://localhost:3000, sign in, and drop photos and videos on **Library**.

## Quick start (Docker)

```bash
cp .env.example .env          # fill APP_SECRET + ENCRYPTION_KEY
docker compose up -d --build
docker compose run --rm worker pnpm owner:create --email you@example.com --name "Your Name"
```

To let the agent import from a folder (for example an iCloud Photos export), set `IMPORT_DIR=/path/to/folder`
before `docker compose up`. It's mounted read-only at `/import`. Then add a `local_folder` source
(UI arrives in a later phase; for now insert into `media_sources` with `config = {"path": "/import"}`).
All ports bind to 127.0.0.1. Use a TLS reverse proxy or VPN for remote access.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Web + worker in watch mode |
| `pnpm test` | Unit tests. Set `TEST_DATABASE_URL` (role with CREATEDB) to include Postgres integration tests. |
| `pnpm typecheck` | Strict type-check of every package |
| `pnpm build` | Production build of the web app |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply migrations |
| `pnpm owner:create` | Create the owner or reset their password (no public sign-up) |
| `pnpm --filter @intstapost/worker run-job DailyMediaScan` | Run a scheduled job now |

## Docs

- [Architecture](docs/ARCHITECTURE.md): pipeline, modules, provider abstractions, layout
- [Data model](docs/DATA_MODEL.md)
- [Integrations](docs/INTEGRATIONS.md): what each official API can and can't do (verified Oct 2026)
- [Security & privacy](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
