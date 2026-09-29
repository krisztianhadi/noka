# Architecture

How the pieces fit, and the decisions that are not obvious from the code. The
build contract is [PLAN.md](PLAN.md); this file records what was actually
chosen and why, including where the plan was wrong.

## Shape

```
browser ──▶ Astro SSR (src/pages, src/middleware.ts)
              │
              ├─ guest plane   /c/{slug}         QR slug + 6-digit PIN
              │                 src/lib/pin.ts, src/lib/slug.ts, src/lib/crypto.ts
              │
              └─ owner plane   /dashboard        better-auth session (Phase 2)
                                src/db/*, Drizzle + postgres.js
                                          │
                                          ▼
                                   PostgreSQL 16
                                   cards · contacts · card_notes · scan_attempts
```

- **No client framework.** Every page is server-rendered HTML. The responder
  plane has no `<script>` at all, asserted in `tests/e2e/smoke.spec.ts`.
- **No ORM magic.** Drizzle is a typed query builder over `postgres.js`; the SQL
  is visible in `drizzle/`.
- **Two planes, never mixed** (PLAN §3). The guest cookie is a hand-signed
  token; the owner session belongs to better-auth. Neither is accepted on the
  other's routes.
- **Encryption is app-side** (D1). The database never sees the key, so a stolen
  dump or backup yields ciphertext regardless of what happens to a PIN.

## Data flow of a contact

1. The owner types a name, a relation from the fixed vocabulary, a phone number
   and the contact's spoken languages (Phase 4).
2. The values are validated, packed into the schema-2 JSON payload
   (`src/lib/contact-payload.ts`) and encrypted with AES-256-GCM
   (`src/lib/crypto.ts`) into `contacts.payload_encrypted`, with the key version
   in `contacts.key_version`.
3. A responder enters the PIN. The server verifies it against `pin_hash`,
   fetches the card's contacts in a single query, decrypts in memory, renders,
   and discards (Phase 5).

Nothing decrypted is cached, logged or sent to error tracking; pino redaction
(`src/lib/logger.ts`) is the backstop.

## Encrypted blob format

```
[ key version: 1 byte ][ IV: 12 bytes ][ ciphertext ][ GCM tag: 16 bytes ]
```

One blob per contact rather than one column per field: column names leak
metadata, and a new field then needs no migration. An unknown `schema` version
is a hard error, never a partial render.

## ADRs

### ADR-001 — Postgres 16 on port 5433, dev server on port 3200

5432 belongs to `ghosted-db` and 3100 to kaja on this machine. `noka-db` runs on
**5433**; the dev server uses **3200**. The dev server binds on all interfaces so
a real phone can open a card over LAN, which is the only way to test the
responder's actual conditions.

### ADR-002 — Astro 7, `@astrojs/node` in standalone mode

`output: 'server'`, `session: false` (Astro's own session store is not used),
`devToolbar: false` (the toolbar injects scripts, and the responder plane must be
provably script-free in dev too). Production runs `dist/server/entry.mjs`
directly — no package manager at container runtime, which removes the
pnpm-version failure mode.

### ADR-003 — App-side AES-256-GCM with a keyring (D1)

Not pgcrypto: a per-row KDF on the hot path breaks the bad-network budget, and
pgcrypto needs an extension the platform may not grant. The keyring is
`{ 1: key }` and the version lives in the blob, so rotation stays possible
without downtime.

### ADR-004 — D11 dropped: the owner's email is stored in plaintext

**This reverses a decision in PLAN §2/§4.** The Phase 0 spike read
better-auth 1.7.6's core schema (`@better-auth/core/dist/db/schema/user.mjs`):
`email` is required and lowercased, `name` is required, and sign-in looks the
user up by that column. Storing only `email_hash` + `email_encrypted` would mean
a custom adapter and hooks rewriting every sign-up, sign-in and reset lookup —
maintenance risk in the one part of the app that must never be subtly wrong.

Consequences, all recorded rather than hidden:

- `users.email` is plaintext at rest; `users.name` is plaintext too, and it is
  where the owner's first name comes from (D27). Both are less sensitive than the
  contact data, which stays encrypted.
- `email_hash` and the blind index are gone; `EMAIL_LOOKUP_KEY` stays in the
  inventory for session/audit hashing.
- PLAN §10's hand-written `users` table is replaced by better-auth's schema,
  generated in Phase 2. PLAN §16 keeps `EMAIL_LOOKUP_KEY` as "not rotatable in
  v1" (D23) — still true, for a different use.

### ADR-005 — `relation` is a closed vocabulary (D31)

Seven codes (`spouse`, `partner`, `parent`, `sibling`, `child`, `friend`,
`other`), validated on write and rendered through the catalogue, so a Chinese
responder reads 配偶 rather than "Wife". Free text would be untranslatable;
narrative beyond the seven belongs in the notes.

### ADR-006 — One catalogue drives the responder page and the printed card (D19, D20)

`src/i18n/catalogue.ts` holds every string in all five languages, keyed by a
type derived from the English object: a missing translation is a TypeScript
error, and `tests/unit/catalogue.test.ts` re-checks emptiness, stray keys and
placeholder drift at runtime. Language selection is
`Accept-Language` ∩ the card's own ordered set (`src/i18n/negotiate.ts`), falling
back to `languages[0]`.

### ADR-007 — The guest cookie is hand-signed; Astro's session store is unused

The cookie is `{slug, pin_version, exp}` signed with `VIEW_COOKIE_SECRET`
(D14, D22), because it must be validated against the database on every view
anyway and Astro's session driver would add a second store with its own
lifecycle. Owner sessions are better-auth's DB-backed sessions.

### ADR-008 — `cards.user_id` is a real foreign key (resolved)

better-auth's `users` table landed in Phase 2 (`src/db/auth-schema.ts`), and
`cards.user_id` now references it with `ON DELETE CASCADE`. An integration test
asserts that a card whose owner does not exist is rejected.

### ADR-009 — Argon2id for owner passwords too, not better-auth's scrypt

better-auth defaults to scrypt. §3 of PLAN asks for argon2id, and the project
already has a tested Argon2id module for PINs, so `emailAndPassword.password`
is wired to `hash`/`verify` from `src/lib/argon2.ts`: one KDF, one set of
parameters, in one place. An integration test asserts the stored value starts
with `$argon2id$` and never contains the password.

### ADR-010 — the owner plane is plain server-rendered forms

`/signup` and `/login` POST to themselves, call `auth.api.*` with
`asResponse: true`, and forward better-auth's `Set-Cookie` on a 303 — so the
browser needs no JavaScript and the session cookie is never touched by our own
code. Every state-changing POST passes `isSameOrigin` (`src/lib/http.ts`):
`SameSite=Lax` already blocks cross-site POSTs from carrying the session, and
this is the second lock on the same door. `/logout` is POST-only for the same
reason a GET logout is a bad idea: any page could sign the owner out with an
image tag.

Two consequences worth recording:

- better-auth logs "Invalid password" for a wrong password and "User not found"
  for an unknown address. The **responses** are byte-identical (asserted in
  `tests/integration/auth.test.ts`), which is what an attacker sees; the log
  difference is for us. Response-time padding for that path is §6 layer 0 work
  and is still outstanding.
- The session cookie carries `Secure` only when the origin is HTTPS, which is
  how better-auth decides. Production runs on HTTPS, local development does not.

## What is deliberately absent

No client framework, no analytics on `/c/*`, no sponsor markup on `/c/*` or
`/dashboard`, no CDN, no webfont (Chinese included — the system CJK font is
enough), no Redis (rate-limit state lives in Postgres), and no structured
medical fields.
