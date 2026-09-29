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
2. The values are validated, packed into the schema-3 JSON payload
   (`src/lib/contact-payload.ts`) and encrypted with AES-256-GCM
   (`src/lib/crypto.ts`) into `contacts.payload_encrypted`, with the key version
   in `contacts.key_version`. Schema-2 rows still read, upgraded in memory with
   `call` as the default channel.
3. A responder enters the PIN. The server verifies it against `pin_hash`,
   fetches the owner's contacts in a single query, decrypts in memory, renders
   with per-channel buttons or an "available on" line, and discards.

Nothing decrypted is cached, logged or sent to error tracking; pino redaction
(`src/lib/logger.ts`) is the backstop.

## The card image

`src/lib/card-artwork.ts` draws the card as SVG — header, QR (`qrcode`), PIN, language line —
at ID-1 proportions and 300 dpi, then rasterises it with `sharp` for
`/dashboard/card/card.jpg`. It is generated per request and never cached, because it shows
the current PIN. The deterministic, exact-size PDF pipeline (Phase 7) replaces this preview;
the geometry constants are already shared.

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
