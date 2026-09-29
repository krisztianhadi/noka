# Changelog

Newest first. Dated, tagged **Feature** / **Fix** / **Break**.

## 2026-09-29

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
