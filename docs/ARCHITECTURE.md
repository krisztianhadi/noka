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
              └─ owner plane   /dashboard        better-auth session
                                src/db/*, Drizzle + postgres.js
                                          │
                                          ▼
                                   PostgreSQL 16 (noka-db, :5433)
   users · sessions · accounts · verifications        (better-auth owns these)
   cards · contacts · owner_notes · scan_attempts     (ours)
   rate_limits                                        (the PIN limiter's store, D12)
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

## Who owns what

```
owner (users)
  ├── contacts        one encrypted payload per person, incl. reachability channels
  ├── owner_notes     one encrypted blob of free text
  └── card            slug + PIN hashes; the ONLY thing a QR points at
```

Contacts and notes hang off the **owner**, not the card (ADR-022). That is what makes the
onboarding order work — contacts first, then notes, then the card — and it means reissuing
or deleting a card never touches the people or the text. The card is an access token with a
lifecycle, not a container.

The card has no on/off switch (ADR-020): it is `active` from creation, and "New card"
replaces the slug *and* the PIN, which kills anything already printed.

## Data flow of a contact

1. The owner types a name, a relation from the fixed vocabulary, a phone number,
   the channels this number is reachable on (call, text, WhatsApp, Signal, Telegram,
   Viber — call by default) and the contact's spoken languages.
2. The values are validated, packed into the schema-4 JSON payload
   (`src/lib/contact-payload.ts`) and encrypted with AES-256-GCM
   (`src/lib/crypto.ts`) into `contacts.payload_encrypted`, with the key version
   in `contacts.key_version`. Schema 4 moved "text message" out of the channel list and into
   `text_only` — a fact about the person, not about a service. Schema-2 and schema-3 rows
   still read, upgraded in memory (`call` as the default channel).
3. A responder enters the PIN. The server verifies it against `pin_hash`,
   fetches the owner's contacts in a single query, decrypts in memory, renders
   with per-channel buttons or an "available on" line, and discards.

Nothing decrypted is cached or logged; pino redaction (`src/lib/logger.ts`) is the
backstop, and there is no error-tracking vendor to send it to (ADR-033).

## Where the other moving parts live

| Concern | Where | Note |
|---|---|---|
| PIN attempts, backoff, `Retry-After` | `src/lib/limiter.ts`, `rate_limits` | one shared counter in Postgres — no Redis (D12); capped backoff, never a permanent lock |
| Scan audit and its 30-day sweep | `src/lib/retention.ts`, `scripts/purge.mjs` | `pnpm db:purge`; the Railway cron that should call it is not wired yet ([RUNBOOK.md](RUNBOOK.md) §4) |
| Print masters | `src/lib/card-pdf.ts`, `src/lib/card-artwork.ts`, `src/pages/dashboard/card/pdf.ts` | the artwork is rasterised at 600 dpi once per document and drawn per position; ten cards on A4, rotated (§11 Phase 7) |
| Copy in five languages | `src/i18n/catalogue.ts`, `src/i18n/locales/*.ts` | one file per language, parity enforced by a test; `pnpm i18n:report` |
| Sponsors | `src/config/sponsors.ts`, `src/components/SponsorStrip.astro` | landing and auth pages only; `usableSponsors()` refuses non-same-origin logos (D18) |
| Headers per plane | `src/middleware.ts` | responder `default-src 'none'`; owner plane `default-src 'self'`; [THREAT-MODEL.md](THREAT-MODEL.md) §3 |
| Operator scripts | `scripts/` | `db:purge`, `drill:restore`, `load:test`, `usage-report` — [RUNBOOK.md](RUNBOOK.md) |

## The card image

`src/lib/card-artwork.ts` draws the card as SVG — header, QR (`qrcode`), PIN, language line —
at ID-1 proportions, and `sharp` rasterises it for `/dashboard/card/card.jpg`. That JPEG is
the on-screen preview and is still generated per request and never cached, because it shows
the current PIN. The print path is separate and exact (`card-pdf.ts`): the same artwork at
600 dpi, laid out as the card at ISO ID-1, one on A4, or ten on A4 — the geometry constants
are shared between the two.

## Encrypted blob format

```
[ key version: 1 byte ][ IV: 12 bytes ][ ciphertext ][ GCM tag: 16 bytes ]
```

One blob per contact rather than one column per field: column names leak
metadata, and a new field then needs no migration. An unknown `schema` version
is a hard error, never a partial render.

## Decisions

Every decision, with its reasoning and its cost, is in
[DECISIONS.md](DECISIONS.md) — 33 numbered ADRs, including the one that reversed
a decision in PLAN (ADR-004) and the one that decides how failures are noticed
(ADR-033: logs only, no vendor). What must not leak, and which test fails if it does,
is in [THREAT-MODEL.md](THREAT-MODEL.md). How to run and recover the thing is in
[RUNBOOK.md](RUNBOOK.md). This file stays about how the pieces fit.

## What is deliberately absent

No client framework, no analytics on `/c/*`, no sponsor markup on `/c/*` or
`/dashboard`, no CDN, no webfont (Chinese included — the system CJK font is
enough), no Redis (rate-limit state lives in Postgres), and no structured
medical fields.
