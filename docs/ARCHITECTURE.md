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

## Decisions

Every decision, with its reasoning and its cost, is in
[DECISIONS.md](DECISIONS.md) — 17 numbered ADRs, including the one that reversed
a decision in PLAN. This file stays about how the pieces fit.

## What is deliberately absent

No client framework, no analytics on `/c/*`, no sponsor markup on `/c/*` or
`/dashboard`, no CDN, no webfont (Chinese included — the system CJK font is
enough), no Redis (rate-limit state lives in Postgres), and no structured
medical fields.
