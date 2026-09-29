# Setup

## Services

| Service | Where | Port |
|---|---|---|
| PostgreSQL 16 (`noka-db`) | local Docker container | **5433** |
| Postgres (`ghosted-db`) | local Docker container — **not ours** | 5432 |
| Astro dev server | `pnpm dev` | **3200** |
| kaja dev server | — | 3100 |
| ghosted dev server | — | 3000 |

```sh
docker run -d --name noka-db \
  -e POSTGRES_USER=noka -e POSTGRES_PASSWORD=noka -e POSTGRES_DB=noka \
  -p 5433:5432 postgres:16-alpine
```

Connection string: `postgres://noka:noka@localhost:5433/noka`

## Environment

Every value is required except the commented ones; `src/config.ts` validates them
with zod and the process refuses to serve without them. `.env` is gitignored —
`.env.example` lists the names with empty values.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Railway provides it in deploy. |
| `PUBLIC_CARD_ORIGIN` | Origin baked into every QR. Short, and **changing it invalidates printed cards**. |
| `VIEW_COOKIE_SECRET` | Signs the guest cookie `{slug, pin_version, exp}` (D22). ≥32 bytes. |
| `BETTER_AUTH_SECRET` | better-auth session signing (owner plane). |
| `CONTACT_ENCRYPTION_KEY` | AES-256-GCM keyring entry 1, 32 bytes base64. **Loss = data loss.** |
| `EMAIL_LOOKUP_KEY` | HMAC key for hashing. Not rotatable in v1 (D23). |
| `IP_HASH_KEY` | HMAC key for IP / IP-prefix hashing. Not rotatable in v1 (D23). |
| `LOG_LEVEL` | pino level; redaction of `payload`, `pin`, `phone`, `notes` is fixed, not configurable. |
| `PORT` | Railway sets it; local scripts default to 3200. |
| `ASTRO_TELEMETRY_DISABLED` | Set to 1. Astro's telemetry writes to `~/.config/astro`. |

Generate a secret with `openssl rand -base64 32`.

**Where credentials live:** Railway variables for deploy, a password manager for
the originals. The database holds none of them — that is the point of ADR-003.

## Credentials and the sandbox

This workspace is sandboxed: only paths under `/home/k/Code/noka` are writable.
Four consequences, all handled by committed config:

- `.npmrc` puts the pnpm store and cache in `.tmp/` inside the workspace.
- `PLAYWRIGHT_BROWSERS_PATH=.tmp/ms-playwright` keeps the test browser local:
  `pnpm exec playwright install chromium` installs it there, not in `~/.cache`.
- `ASTRO_TELEMETRY_DISABLED=1`, because `astro` cannot write `~/.config/astro`.
- `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_STATE_HOME` point at `.tmp/` for
  pnpm runs, since `~/.cache` is read-only here.

## Commands

| Command | Notes |
|---|---|
| `pnpm dev` | :3200, bound on all interfaces for phone testing |
| `pnpm build` && `pnpm start` | production build → `dist/server/entry.mjs` |
| `pnpm db:generate` | writes a new SQL migration into `drizzle/` (commit it) |
| `pnpm db:migrate` | applies migrations; same script the container runs |
| `pnpm typecheck` | `astro check`, tests included |
| `pnpm test` | Vitest; loads `.env`, integration tests need Postgres up |
| `pnpm test:e2e` | Playwright against the **built** server (dev injects HMR scripts). It reuses a server already listening on :3200 — restart yours first, or the suite tests your old build. |

## Breach procedure (one paragraph, per §8)

If a data exposure is suspected: rotate `CONTACT_ENCRYPTION_KEY` by adding a new
version to the keyring rather than replacing entry 1, revoke every owner session
(delete rows in better-auth's `sessions` table), rotate
`VIEW_COOKIE_SECRET` (which invalidates every live guest cookie), rotate the
database password and the Railway variables, then determine what was reachable
from the logs — remembering that contact payloads are ciphertext without the key.
Notify affected owners by email with what was exposed and what was not. Keep the
sequence, not the story: rotate, revoke, rotate, notify.
