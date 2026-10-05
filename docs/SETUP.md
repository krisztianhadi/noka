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
| `EMAIL_TRANSPORT` | `log` (default) or `resend`. With no key set, mail goes to the log — the reset link is in the terminal, one click away. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Required only when `EMAIL_TRANSPORT=resend`; the app refuses to boot without both, rather than failing when a stranger clicks "forgot password". `EMAIL_FROM` must be on a domain Resend has verified. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Both or neither: set, the Google button appears on the auth pages; unset, nothing changes. Half a client refuses to boot. |
| `ASTRO_TELEMETRY_DISABLED` | Set to 1. Astro's telemetry writes to `~/.config/astro`. |

Generate a secret with `openssl rand -base64 32`.

**Where credentials live:** Railway variables for deploy, a password manager for
the originals. The database holds none of them — that is the point of ADR-003.

## Credentials and the sandbox

This workspace is sandboxed: only paths under `/home/k/Code/noka` are writable.
`.npmrc` handles pnpm (store and cache under `.tmp/`); the variables a command needs
for everything else are in [The sandbox environment](#the-sandbox-environment) below.

## Commands

| Command | Notes |
|---|---|
| `pnpm dev` | :3200, bound on all interfaces for phone testing. Loads `.env` itself — see below. After a killed server, delete `.astro/dev.json` |
| `pnpm build` && `pnpm start` | production build → `dist/server/entry.mjs` |
| `pnpm db:generate` | writes a new SQL migration into `drizzle/` (commit it) |
| `pnpm db:migrate` | applies migrations; same script the container runs |
| `pnpm db:purge [--dry-run]` | the 30-day `scan_attempts` sweep. Named `db:purge` because pnpm intercepts `purge` as its own command — `pnpm purge --dry-run` printed `Unknown option` and never ran the script |
| `pnpm drill:restore [--keep]` | backup restore drill: dump, restore into a scratch database, compare content fingerprints, prove a wrong keyring opens nothing. Needs Docker. See [RUNBOOK.md](RUNBOOK.md) §5 |
| `pnpm load:test` | smoke load test against `:3200` (or `--origin`); GET only, writes nothing. See [RUNBOOK.md](RUNBOOK.md) §6 |
| `pnpm typecheck` | `astro check`, tests included |
| `pnpm test` | Vitest; loads `.env` itself, integration tests need Postgres up |
| `pnpm test:e2e` | Playwright owns its server: it builds to `dist-e2e` and serves on **:3300**, never reusing one that is already running (ADR-029). Needs the browser path: `PLAYWRIGHT_BROWSERS_PATH=.tmp/ms-playwright pnpm test:e2e` |

### `pnpm dev` and `.env`

Astro's dev server reads `.env` into `import.meta.env`, and this project's server code
reads `process.env` (`src/config.ts` validates it with zod). Until 2026-10-05 that meant
`pnpm dev` served the marketing pages — the ones with no configuration to miss — and
answered **500** on `/dashboard`, `/signup` and every auth POST with
`Invalid environment — DATABASE_URL … received undefined`.

`astro.config.mjs` now loads the file into `process.env` at config time, so `pnpm dev`
behaves like the built server. A real environment variable still wins, so CI, Railway
and `pnpm start` are unaffected.

### After a killed dev server: delete the lock, do not `--force`

`astro dev` writes a lock to `.astro/dev.json` with its **PID inside the sandbox's own
PID namespace**. Killing the job leaves that file behind, and the next `pnpm dev` finds
the recorded PID alive in the new namespace and refuses with `Another astro dev server
is already running`. It is a stale artifact, not a running server:

```sh
rm -f .astro/dev.json && pnpm dev
```

**Do not reach for `--force` here.** Astro's own advice is `astro dev --force`, and it
kills the PID it recorded — which in a fresh namespace can be the very process group
`--force` is running in. Measured 2026-10-05: the command died immediately with exit 143
(SIGTERM) and no server started. Deleting the file is deterministic and has no such
failure mode. The built server has no lock at all.

## The sandbox environment

This workspace is sandboxed: only paths under `/home/k/Code/noka` are writable. The
env prefix a command needs depends on what it writes:

| What | Why |
|---|---|
| `.npmrc` (`store-dir`, `cache-dir` under `.tmp/`) | pnpm; committed, so no prefix needed |
| `ASTRO_TELEMETRY_DISABLED=1` + `XDG_CONFIG_HOME=.tmp/xdg-config` | `astro` otherwise tries to write `~/.config/astro` and fails before it starts |
| `PLAYWRIGHT_BROWSERS_PATH=.tmp/ms-playwright` | the test browser lives in the workspace (`pnpm exec playwright install chromium`); without it Playwright looks in `~/.cache/ms-playwright`, which does not exist here |
| `XDG_DATA_HOME`, `XDG_STATE_HOME` under `.tmp/` | only needed for pnpm runs that write state. **Do not point `XDG_CACHE_HOME` at `.tmp/` without also setting the browser path**: Playwright derives its browser directory from it, and the suite then fails in 6 ms per test with `Executable doesn't exist at .tmp/xdg-cache/ms-playwright/…` |


## The local server does not survive a harness restart

Whatever is listening on :3200 is a child of the agent harness, which runs it inside a sandbox
started with `--die-with-parent` (and its own PID namespace). Restarting the harness therefore kills
the server, and nothing started from inside that sandbox can outlive it — `nohup` and `setsid`
included, because the sandbox itself goes away. This is expected, not a crash: after a harness
restart, check :3200, and if it answers nothing, start it again:

```sh
XDG_DATA_HOME=.tmp/xdg-data XDG_CACHE_HOME=.tmp/xdg-cache XDG_STATE_HOME=.tmp/xdg-state \
XDG_CONFIG_HOME=.tmp/xdg-config ASTRO_TELEMETRY_DISABLED=1 HOST=0.0.0.0 \
node --env-file-if-exists=.env ./dist/server/entry.mjs
```

Then confirm both addresses before using it: `curl -o /dev/null -w '%{http_code}'` against
`http://127.0.0.1:3200/` **and** `http://<lan-ip>:3200/`.

## Breach procedure (one paragraph, per §8)

If a data exposure is suspected: rotate `CONTACT_ENCRYPTION_KEY` by adding a new
version to the keyring rather than replacing entry 1, revoke every owner session
(delete rows in better-auth's `sessions` table), rotate
`VIEW_COOKIE_SECRET` (which invalidates every live guest cookie), rotate the
database password and the Railway variables, then determine what was reachable
from the logs — remembering that contact payloads are ciphertext without the key.
Notify affected owners by email with what was exposed and what was not. Keep the
sequence, not the story: rotate, revoke, rotate, notify.
