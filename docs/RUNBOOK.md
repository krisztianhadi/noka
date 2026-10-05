# Runbook

Operations for noka, written for the person holding the keys — today that is one person.
It assumes [SETUP.md](SETUP.md) (environment, ports, sandbox quirks) and
[THREAT-MODEL.md](THREAT-MODEL.md) (what must not leak) have been read.

Nothing here is aspirational: every command was run, and the numbers below were measured on
**2026-10-05** on this workstation. Where something is not wired up yet, it says so.

## 1. The surfaces

| Where | What it is | How it starts |
|---|---|---|
| Local `:3200` | the working instance: dev server or the built server | `pnpm dev` (loads `.env` itself) or the built-server command in [SETUP.md](SETUP.md) |
| Local `:5433` | `noka-db`, Postgres 16 in Docker | `docker start noka-db` |
| Local `:3300` | the e2e suite's own server, built into `dist-e2e` | `pnpm test:e2e` (never reuses an existing server, ADR-029) |
| Railway | production — **not deployed yet** | the launch checklist in §9 |

The e2e suite runs against whatever `DATABASE_URL` points at, which locally is the same
database the dev server uses. It creates and deletes its own accounts, but a suite run
against a database you care about is still a suite run against a database you care about.

## 2. Local restart, and the two traps

The server on `:3200` is a child of the agent harness, which runs its sandbox with
`--die-with-parent`: nothing started inside it outlives a harness restart, `nohup` and
`setsid` included. After a restart, check the port and start it again — the command is in
[SETUP.md](SETUP.md).

Two traps, both measured, both written down because they cost time twice:

1. **`pnpm dev` and `.env`.** Astro's dev server reads `.env` into `import.meta.env`;
   `src/config.ts` validates `process.env`. Since 2026-10-05 `astro.config.mjs` loads the
   file into `process.env`, so `pnpm dev` behaves like the built server. Before that, the
   marketing pages rendered and `/dashboard` answered 500.
2. **A stale dev lock.** `astro dev` writes `.astro/dev.json` with the PID *inside the
   sandbox's PID namespace*. After killing a server, the next start refuses with "Another
   astro dev server is already running". Delete the file — `rm -f .astro/dev.json` — rather
   than `--force`, which kills the recorded PID and in a fresh namespace that can be the
   process group it is running in (exit 143, no server).

## 3. Migrations

```sh
pnpm db:generate     # writes drizzle/NNNN_*.sql — commit it with the code change
pnpm db:migrate      # applies them locally
```

The container applies them on start (`scripts/migrate-on-start.mjs`, advisory-locked), and
`railway.json` runs that before the server entrypoint. Migrations are **forward-only**: a
rollback is a new migration, so a change that cannot be expressed that way — dropping a
column the running code still reads — has to be two deployments (add and backfill, then
remove).

## 4. Retention: the 30-day sweep

```sh
pnpm db:purge --dry-run    # says what would go, deletes nothing
pnpm db:purge              # deletes scan_attempts older than 30 days
```

- The rows are the audit trail of PIN attempts: hashed IP prefix, outcome, timestamp.
  Nothing else in the database expires (contacts, notes, cards live until the account is
  deleted).
- The script is named `db:purge`, not `purge`, because **pnpm intercepts `purge`** as one of
  its own commands: `pnpm purge --dry-run` printed `Unknown option: 'dry-run' … For help, run:
  pnpm help clean` and never ran this code. `scripts/alias-loader.mjs` had a second bug on the
  same path — it treated `src/config/` (the sponsor configuration) as the module for
  `@/config` — which `tests/integration/cli.test.ts` now guards, along with the dry run
  deleting nothing.
- **The schedule is not wired.** PLAN §11 wanted a Railway cron service (D24) and it does not
  exist yet: today the sweep runs when a person runs it. The privacy page states that
  honestly rather than claiming a job that nobody schedules. It is the first item of the
  launch checklist.

## 5. Backup, and the restore drill

```sh
pnpm drill:restore           # dump → restore into a scratch database → compare fingerprints
pnpm drill:restore --keep    # leave the scratch database behind to look at
```

What it does, and why it is written as a script rather than a paragraph: a dump that
restores cleanly but whose contacts cannot be decrypted is not a backup. The drill

1. decrypts every contact in the live database with the current keyring and fingerprints the
   content (`id | name | phone | channels | spoken | text-only`, hashed — no plaintext is
   printed);
2. `pg_dump`s the database into `.tmp/restore-drill/`;
3. drops and recreates `noka_restore_drill`, restores the dump into it;
4. fingerprints the restored rows the same way and compares;
5. reads the restored rows with a **wrong keyring** and asserts they all refuse.

Measured 2026-10-05, against the development database:

```
source      contacts=3943 decrypted=3943 undecryptable=0   fingerprint a62a18a07f74a011
dump        .tmp/restore-drill/…dump (2.9 MB)
restored    contacts=3943 decrypted=3943 undecryptable=0   fingerprint a62a18a07f74a011
wrong key   decrypted=0 refused=3943
tables      users=4739 cards=2147 contacts=3943 scan_attempts=1056 sessions=4880
DRILL PASSED
```

Turned up twice before it passed — a wrong column name, and the alias-loader bug of §4 — which
is the reason to keep it: a drill that cannot fail proves nothing.

**What the drill does not cover, stated plainly:**

- It restores into the **same Postgres instance** it dumped from. A real disaster restores
  into a fresh instance, possibly a different minor version, with no `pg_dump` binary of its
  own — practice that path before relying on it.
- It is not a point-in-time recovery test. Railway's managed Postgres takes backups on its
  own schedule; whether PITR is available depends on the plan, and that has to be checked
  when the service is deployed.
- **The keyring is not in the dump**, by design (ADR-003). A dump without
  `CONTACT_ENCRYPTION_KEY` is authenticated ciphertext: keep the keyring in the password
  manager, separate from the database provider, or a restore produces nothing readable.

## 6. Load test

```sh
pnpm load:test                                             # 10 s, 20 concurrent, :3200
pnpm load:test --origin https://noka.example --duration 20 --concurrency 50
```

GET only, so the PIN limiter is not involved: it measures rendering and the slug lookup, and
writes nothing. Measured 2026-10-05 against the built server on this workstation, warm
database, no TLS, no proxy in front:

| Path | rps | p50 | p95 | p99 | per request |
|---|---:|---:|---:|---:|---:|
| `/c/{slug}` (responder) | 1302 | 14 ms | 27 ms | 32 ms | 5.7 kB |
| `/healthz` | 3407 | 6 ms | 9 ms | 12 ms | 0.1 kB |
| `/` (landing) | 1159 | 17 ms | 23 ms | 30 ms | 74.8 kB |

Read it for the shape, not the peak: 13,024 responder requests with no failure, and a p95
under 30 ms on localhost. The landing is the heaviest page by an order of magnitude (it
carries the sample card image) and it is the one to watch on a slow connection; the
responder page is the one that has to survive a bad one, and at 5.7 kB it does. A real
capacity number needs the Railway instance and a cold cache.

## 7. Rotating secrets

| Secret | What rotation does today |
|---|---|
| `CONTACT_ENCRYPTION_KEY` | **There is no second key version in the ring yet.** `src/lib/keys.ts` builds `keyring({ 1: secret })`, and v1 has no re-encryption pass (D23). Rotating it today means every existing contact becomes unreadable. Treat a suspected compromise as an incident (§8), not a rotation, until the re-encryption migration exists |
| `VIEW_COOKIE_SECRET` | invalidates every live guest cookie immediately — safe to rotate at any time |
| `BETTER_AUTH_SECRET` | signs sessions; rotating signs everyone out |
| `EMAIL_LOOKUP_KEY`, `IP_HASH_KEY` | not rotatable in v1 (D23): the stored hashes would stop matching |
| Database password, Railway variables | rotate, then redeploy so the new environment is picked up |

## 8. Incident: suspected exposure

The one-paragraph procedure is in [SETUP.md](SETUP.md) (rotate `CONTACT_ENCRYPTION_KEY` by
adding a keyring version rather than replacing entry 1, revoke sessions, rotate
`VIEW_COOKIE_SECRET`, rotate the database password and the Railway variables, determine what
was reachable from the logs, notify owners by email). Two operational notes on top of it:

- The `pnpm db:purge` sweep is what limits how far back a log or a table can be read, and it
  must be running (§4) — an incident response that starts by looking at 30 days of hashed
  attempts is a different conversation from one looking at a year.
- **Logs are the only signal** (ADR-033): there is no error tracker, so the Railway log is
  where the stack trace is, and the 500 page deliberately shows nothing.

## 9. Launch checklist

Nothing here is done yet. Each line is either a decision, a command, or a promise on a public
page that must stop being a promise.

- [ ] **Subprocessors** named on the privacy page (§7): the hosting provider, the managed
      Postgres, the mail provider once Resend is configured. It currently says the service is
      not deployed yet and that this section will name them.
- [ ] **`PUBLIC_CARD_ORIGIN`** set to the real short domain *before any card is printed* —
      it is baked into every QR code (PLAN §14.2).
- [ ] **Railway cron for `pnpm db:purge`**, run once in production and verified
      (`--dry-run` first), and the privacy page updated to claim a running job.
- [ ] **Backups enabled**, and the restore drill run against a **production** dump rather
      than a local one (§5).
- [ ] **Staging environment** with its own database and `PUBLIC_CARD_ORIGIN`, deployed from a
      branch, so a change reaches a stranger-facing host before the real one.
      **Deferred by the owner on 2026-10-05: "no deploy yet, we are not done."** Nothing is
      deployed anywhere today, so there is no production to keep a staging environment
      separate from; the checklist keeps it because it has to happen before the first real
      card exists, not because it was forgotten.
- [ ] **Rate-limit constants** reviewed against §6 before a real card exists.
- [ ] **Load test** against the deployed instance, numbers recorded here.
- [ ] **ADR-033 revisited** if anyone other than the developer operates it: logs-only stops
      being a process and becomes a dependency on one person's attention.
- [ ] **Phase 7 leftovers**: the no-PIN card variant (a decision, not just code) and the
      physical print-and-scan test with three phones at 10–30 cm.
