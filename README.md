# noka

**next of kin access** — an emergency contact card. A printed ISO ID-1 card
carries a QR code and a six-digit PIN. Anyone who finds it scans, enters the
PIN, and sees the people to call on a server-rendered page that works on a bad
mobile connection, without JavaScript and without an app.

Functionality first: the responder pages are deliberately plain, and no design
pass has happened yet.

## Status

Phase 5 — the whole journey works locally: sign up, build a card, add encrypted
contacts, switch it on, then open the card URL and enter the PIN. The responder
page is localised into the card's own languages, renders in one request, and runs
no JavaScript at all. Next: rate limiting on the PIN endpoint, then printing. See
[docs/CHANGELOG.md](docs/CHANGELOG.md) and [docs/PLAN.md](docs/PLAN.md).

## How it works

- **Guest plane** (`/c/{slug}`): QR slug + PIN, read-only, absolute 15-minute
  cookie, localised into the card's own language set. Zero JavaScript, one
  request, no third-party anything.
- **Owner plane** (`/dashboard`): email/password or Google via better-auth, SSR
  forms, no client framework.
- **Contact data** is AES-256-GCM encrypted in the app; the key never reaches
  the database. A stolen dump yields ciphertext.

## Quick start

```sh
# 1. Postgres 16 on 5433 (5432 belongs to another project on this machine)
docker run -d --name noka-db \
  -e POSTGRES_USER=noka -e POSTGRES_PASSWORD=noka -e POSTGRES_DB=noka \
  -p 5433:5432 postgres:16-alpine

# 2. Environment
cp .env.example .env
openssl rand -base64 32   # repeat for VIEW_COOKIE_SECRET, BETTER_AUTH_SECRET,
                          # CONTACT_ENCRYPTION_KEY, EMAIL_LOOKUP_KEY, IP_HASH_KEY
pnpm install
pnpm db:migrate

# 3. Development
pnpm dev          # http://localhost:3200
```

The dev server binds on all interfaces so a phone on the same network can open
a card URL — that is the responder's real testing conditions.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Astro dev server on :3200 |
| `pnpm build` / `pnpm start` | Production build to `dist/`, then run it |
| `pnpm typecheck` | `astro check` across every file, tests included |
| `pnpm test` | Vitest unit + integration (integration needs Postgres) |
| `pnpm test:e2e` | Playwright against the built server, axe included |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm purge` | Retention sweep (Phase 6; the script lands with it) |

## Deployment

Railway builds the `Dockerfile`; `railway.json` runs the migrations through
`scripts/migrate-on-start.mjs` (advisory-locked, so parallel replicas are safe)
before starting `dist/server/entry.mjs`, and healthchecks `/healthz`.

## Documentation

- [docs/INDEX.md](docs/INDEX.md) — entry point for everything
- [docs/PLAN.md](docs/PLAN.md) — the build contract: decisions, schema, phases
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, and the ADRs
- [docs/SETUP.md](docs/SETUP.md) — environment, services, ports, credentials
- [docs/API.md](docs/API.md) — endpoint contract and implementation status
