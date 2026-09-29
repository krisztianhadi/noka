# Changelog

Newest first. Dated, tagged **Feature** / **Fix** / **Break**.

## 2026-09-29

### Feature — Phase 0 spikes finished (rate limiter, PDF determinism)

- `rate-limiter-flexible` with its Postgres store is wired up behind a five-line
  adapter over the postgres.js client we already use, so the project has one
  database driver, not two (ADR-016). `pg` was installed for the spike and
  removed.
- The `rate_limits` table comes from migration `0002_rate_limits.sql`: the store
  creates it asynchronously and rejects every `consume()` until that resolves,
  which the first responder would have hit.
- Verified: 50 concurrent attempts on one key allow exactly `points` and refuse
  the rest, with no lost updates; two instances share one counter. Recorded the
  property that is easy to misread — the counter counts *attempts*, the window is
  fixed from the first attempt and never extended, and `msBeforeNext` is what
  `Retry-After` will use.
- PDF determinism spiked (`scripts/spike-pdf.mjs`): two renders of the same page
  are byte-identical, with and without an embedded subset font; no random `/ID`,
  no implicit dates. Subsetting is the difference between 5.6 KB and 419 KB.
  Recorded the two limits Phase 7 must respect — a `.ttc` CJK collection cannot
  be subset, and determinism is per pdf-lib version and font bytes (ADR-017).
- Tests: 5 hermetic PDF determinism cases and 6 rate-limiter store cases,
  including the 50-way concurrency proof.

### Feature — the production container is verified

- `docker build` on `node:22-alpine` succeeds, and the running container serves
  `/healthz` (database up), the responder page, and a full signup: the stored
  password came back as `$argon2id$v=19`, which proves `@node-rs/argon2`'s musl
  prebuild loads in the deploy target — the last open Phase 0 spike.
- The image now installs **pnpm 11.24.0** (the version that wrote the lockfile)
  instead of kaja's 10.12.1: pnpm 10 silently ignores `allowBuilds`, and kaja's
  reason for pinning 10 (verify-deps-before-run in non-TTY) cannot apply here
  because the container never invokes pnpm at runtime.
- `.npmrc` is no longer copied into the image; it points pnpm's store at a
  sandbox-local `.tmp` path.

### Feature — Phase 5: the responder page

The product works end to end locally: sign up → card → contacts → switch on →
scan-equivalent URL → PIN → localised contacts, with zero JavaScript.

- Guest plane: `/c/{slug}` (localised PIN form), `/c/{slug}/view`,
  `POST /c/{slug}/hide`, `POST /c/{slug}/lang`. All four are plain form POSTs.
- Signed 15-minute view cookie scoped to `Path=/c/{slug}`, validated against the
  database on every view, so a rotated PIN or a deactivated card takes effect
  immediately (ADR-015). An unrelated card's cookie cannot open it — verified.
- Layer 0 of §6: unknown slugs and deactivated cards get a decoy Argon2
  verification, a 350 ms response floor, and a page that is byte-identical to a
  real card's apart from the slug the responder typed.
- The card's language set drives the page: `lang` cookie → `Accept-Language` ∩
  card set → card default. Verified in Russian in a real browser.
- Audit rows and counters (D25): successes increment `scan_count` and set
  `last_viewed_at`, failures only set `last_failed_at`; both write a
  `scan_attempts` row with an HMAC'd IP prefix, never a raw address.
- One request per page: CSS is inlined, no webfont, no image, no third-party
  anything. The view renders in ~3.4 KB uncompressed.

### Fix — two defects the responder work surfaced

- A POST with no body or an unknown content type got a **500** out of the PIN
  page: `request.formData()` throws. Every form now parses through `readForm()`
  (ADR-014).
- The PIN page rendered its language switcher only for a real card, so the page
  **differed** for an unknown slug — an existence oracle. It now renders the
  default set when there is no card.
- Also: Astro's global `checkOrigin` 403'd the guest form whenever `Origin` was
  absent, which is a real webview behaviour. It is off; our own same-origin
  checks cover the owner plane (ADR-014).

### Feature — Phase 4: contacts and notes

- Contact CRUD (`src/lib/contacts.ts`) with every value encrypted before it
  touches the database and decrypted per read, never cached (ADR-013).
- Relation and spoken languages are vocabulary codes inside the payload, so the
  responder page can translate them. The spoken-language list (13 codes) is
  deliberately wider than the card's five print languages, with labels in all
  five UI languages — which the catalogue's completeness test now covers.
- Phone numbers are normalised to E.164 with **no country inference**: a
  national number without `+` is refused with a reason instead of being guessed
  at (ADR-013).
- Dashboard pages: contacts list with Call/WhatsApp links and spoken-language
  chips, create, edit, delete, and the notes editor with the consent line.
- Two rules live in the service, not the pages: every query is scoped by
  `card_id`, and the last contact on an active card cannot be deleted (D28).
  A card can now be switched on.
- Tests: 106 Vitest cases (9 new integration ones) and 15 Playwright cases, axe
  clean on the contacts and notes pages.
- Playwright now drives `127.0.0.1` rather than `localhost`, which is what made
  server reuse flaky on this machine.

### Feature — Phase 3: the card

- Card lifecycle service (`src/lib/cards.ts`): exactly one card per account,
  idempotent creation, PIN rotation, slug regeneration, activate/deactivate,
  and `cardUrl()` for the QR target.
- The PIN is stored twice on purpose (ADR-011): `pin_hash` to verify,
  `pin_encrypted` so the owner can read and reprint their own card while it is
  active. The dashboard shows it grouped — `123 456` — which is what gets
  printed.
- Activation is gated on having at least one contact (D28); the dashboard
  disables the button and says why. Deactivation is always allowed.
- `/dashboard/card` plus POST-only, origin-checked endpoints for rotate-pin,
  regenerate-slug, activate and deactivate; the `/dashboard` shell now shows the
  card state, contact count, PIN and responder URL.
- The owner guard moved into middleware (ADR-012): `/dashboard/*` redirects to
  `/login` without a session and publishes `Astro.locals.owner`, so no page
  re-derives the session and no new route can forget the guard.
- Tests: 84 Vitest cases (8 new card-lifecycle ones against real Postgres) and
  11 Playwright cases, axe clean on the card page too.

### Feature — Phase 2: the owner plane

- better-auth wired to Drizzle with its own tables (`users`, `sessions`,
  `accounts`, `verifications`), plural names and uuid ids, sessions in Postgres
  so revoking one is a server-side act. Migration `0001_unique_maelstrom.sql`.
- `cards.user_id` is now a real foreign key with `ON DELETE CASCADE` — ADR-008
  closed, with a test that a card whose owner does not exist is rejected.
- Owner passwords are **Argon2id** through better-auth's password hooks instead
  of its default scrypt (ADR-009), so the app has one KDF.
- `/signup`, `/login`, `/logout`, the `/api/auth/*` catch-all, a guarded
  `/dashboard` shell, and a shared `<Plain>` layout. Both forms are plain HTML
  POSTs that forward better-auth's cookie on a 303 — no client JavaScript.
- Every state-changing POST is origin-checked; `/logout` is POST-only.
- Tests: 76 Vitest cases (auth included) and 8 Playwright cases; the owner
  journey signup → dashboard → sign out → sign back in runs in a real browser
  and axe is clean on both auth pages.
- Verified by hand against the built server: signup sets an `HttpOnly`,
  `SameSite=Lax` cookie, `/dashboard` greets the owner, a cross-origin logout is
  `403`, and the session row is gone after sign-out.

### Feature — Phase 1 scaffold

- Astro 7 SSR with `@astrojs/node` (standalone), no client framework anywhere.
  Dev server on **:3200**; binds on all interfaces so a phone can open a card URL.
- PostgreSQL schema of PLAN §10 via Drizzle: `cards`, `contacts`, `card_notes`,
  `scan_attempts`, with the partial unique index that allows exactly one active
  card per owner. Migration `drizzle/0000_glossy_tombstone.sql`.
- Encryption module (`src/lib/crypto.ts`): AES-256-GCM, random IV per write, key
  version stamped in the first byte, keyring ready for a v2 key.
- Crockford base32 slugs (16 random bytes → 26 characters) and argon2id PIN
  hashing at the OWASP parameters, plus the layer-0 decoy verify.
- Responder language machinery: the card's ordered language set, a five-language
  message catalogue shared with the printed instructions, `Accept-Language`
  negotiation, and the fixed relation vocabulary (D31) inside the encrypted
  contact payload.
- Security headers of §5 applied centrally in middleware — the full responder set
  (CSP, `no-store`, `no-referrer`, `noindex`, `Vary`) is asserted on every `/c/*`
  response.
- `/healthz` (database-checked), `/robots.txt`, a placeholder landing page.
- Tests: 69 Vitest cases (unit + real-Postgres integration) and a Playwright
  smoke suite with axe. `astro check`: 0 errors.
- Deployment plumbing reused from kaja: pinned pnpm in the Dockerfile, advisory
  locked `migrate-on-start.mjs`, `railway.json` healthcheck.

### Break — D11 dropped: email is stored in plaintext

- Phase 0 spike result: better-auth's core user model requires a plaintext,
  lowercased `email` column and a required `name`, so the blind-index design
  (`email_hash` + `email_encrypted`, no plaintext address) would need adapter
  hooks fighting the library. Recorded as ADR-004 in `docs/ARCHITECTURE.md`.
- What is unaffected: contact payloads and notes stay AES-256-GCM encrypted, and
  the database still holds no key. `EMAIL_LOOKUP_KEY` remains in the inventory
  for session/audit hashing.
- Consequence for PLAN §10: `users` comes from better-auth's own schema in
  Phase 2 instead of hand-written columns.

### Feature — documentation

- `docs/INDEX.md` added; `docs/PLAN.md` v1 (D1–D31) is the build contract;
  `docs/ORIGINAL_BRIEF.md` kept as a superseded historical document.
