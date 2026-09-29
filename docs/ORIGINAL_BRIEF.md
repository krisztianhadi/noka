> **Historical document — superseded.** This is the spec as first pasted on
> 2026-09-29, kept for provenance. The build contract is [PLAN.md](PLAN.md); where
> the two disagree, PLAN wins. Its SQL and data-model section are outdated in full.
> The product is now **noka** (*next of kin access*); the working title **Nokard is
> archived**.
>
> The deltas that matter:
>
> - **pgcrypto → app-side AES-256-GCM** with a keyring and `key_version`. The DB
>   holds ciphertext and no key.
> - **The 24-hour card lockout is gone** — replaced by atomic exponential backoff
>   with no permanent lock, a per-IP block, and an IPv6 /64 rule.
> - **Two authentication planes**, not one: guest (QR + PIN, read-only, absolute
>   15-minute cookie) and owner (email/password or Google, DB-backed sessions,
>   forgot-password).
> - **`pin_encrypted` alongside `pin_hash`**, so the card stays reprintable from the
>   owner's account while it is active.
> - **Responder pages are localised into the card's own language set**, and every
>   contact carries **spoken languages**. The set is EN / ES / FR / ZH / RU.
> - **3 mm bleed dropped** from the card PDF: white on white, and home printers do
>   not print borderless. Crop marks stay.
> - **Sponsors are static logos on the landing and auth pages only** — no sponsor
>   table, no impressions, no receipts, no pricing, nothing on `/c/*`, and no
>   monetization in v1.
> - Email is Resend; the single `SESSION_SECRET` is replaced by per-purpose secrets
>   (PLAN §16).

# Emergency Contact Card — Technical Spec

## Overview

A web app where users register, add emergency contacts, and download a
printable credit-card-sized card containing a QR code and a PIN. Anyone who
finds the card can scan the QR, enter the PIN, and view the owner's emergency
contacts on a clean, fast, server-rendered page.

Monetization: sponsor placements shown only to registered users (dashboard,
card creation flow, emails). No ads on the emergency view. No data selling.
Free for users.

## Core Principles

- Zero JS on the public emergency view. Pure SSR HTML/CSS.
- Minimal payload. Emergency page must load fast on 3G.
- Minimal data collection. Only what's needed.
- Encrypt contact data at rest (application-level, not just disk).
- The physical card is the credential. QR + PIN printed on the same card.
- No analytics on the emergency view beyond scan counts per card.

## Tech Stack

- Framework: Astro (SSR mode, islands for admin dashboard only)
- Runtime: Node (or Bun if Railpack is configured)
- Database: PostgreSQL (already provisioned on Railway)
- Hosting: Railway (existing project)
- Query layer: raw SQL or a thin query builder. Avoid heavy ORMs.
- Encryption: PostgreSQL pgcrypto extension
- Password/PIN hashing: argon2id (preferred) or bcrypt

## Data Model

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug           text UNIQUE NOT NULL,        -- 128-bit random, base62 (~22 chars)
  pin_hash       text NOT NULL,
  pin_version    int NOT NULL DEFAULT 1,      -- bump on PIN rotation
  failed_count   int NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until   timestamptz,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  name_encrypted  bytea NOT NULL,             -- pgp_sym_encrypt
  phone_encrypted bytea NOT NULL,             -- pgp_sym_encrypt
  relation        text NOT NULL,              -- e.g. "Wife", "Brother"
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE card_notes (
  card_id         uuid PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  notes_encrypted bytea,                      -- free-text, user-authored
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scan_attempts (
  id         bigserial PRIMARY KEY,
  card_id    uuid REFERENCES cards(id) ON DELETE CASCADE,
  ip_hash    text,                            -- hash the IP, don't store raw
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON scan_attempts (card_id, created_at DESC);
```

Notes:
- slug must be cryptographically random (crypto.randomBytes), never sequential.
- relation stays plaintext (not identifying on its own).
- notes_encrypted is optional free text — user's own liability, we just
  transport it. Do not add structured medical fields.

## Environment Variables

```
DATABASE_URL=...                    # provided by Railway
CONTACT_ENCRYPTION_KEY=...          # 32+ byte random, stored OUTSIDE the DB
SESSION_SECRET=...                  # for signed cookies
```

Critical: CONTACT_ENCRYPTION_KEY must never be committed to the repo or
stored in the database. Back it up in a password manager. Key loss = data loss.

## Contact Data Encryption

Use pgcrypto for column-level encryption.

```sql
-- Enable once
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert
INSERT INTO contacts (card_id, name_encrypted, phone_encrypted, relation, sort_order)
VALUES ($1, pgp_sym_encrypt($2, $key), pgp_sym_encrypt($3, $key), $4, $5);

-- Read
SELECT
  pgp_sym_decrypt(name_encrypted, $key)  AS name,
  pgp_sym_decrypt(phone_encrypted, $key) AS phone,
  relation
FROM contacts
WHERE card_id = $1
ORDER BY sort_order;
```

- Pass $key from the app, not from a DB function default.
- Never LIKE / search encrypted columns. Access is always by card_id.
- Decrypt in memory, render, discard. Do not cache decrypted rows.

## Auth Flow (public emergency view)

1. QR encodes: https://<host>/c/{slug}
2. GET /c/{slug}
   - If no valid view-cookie → render PIN entry page (no contact data in HTML).
   - If valid cookie → redirect to /c/{slug}/view.
3. POST /c/{slug} with PIN
   - Rate-limit check first.
   - Verify PIN against pin_hash.
   - On success: set signed cookie scoped to slug, redirect to /c/{slug}/view.
   - On failure: increment failed_count, show generic error.
4. GET /c/{slug}/view
   - Validate cookie (signature + slug + pin_version).
   - Fetch and decrypt contacts + notes.
   - Render the emergency view.

### Cookie

- Signed with SESSION_SECRET.
- Contains: { slug, pin_version, exp }.
- HttpOnly, Secure, SameSite=Lax.
- TTL: 15 minutes.

### PIN Hashing

- argon2id (preferred) or bcrypt.
- Never store the PIN itself.
- Constant-time compare (libraries handle this).

## Rate Limiting

Per slug (in cards table):
- 5 failed attempts → lock 15 minutes
- Next 3 fails → lock 1 hour
- Next fails → lock 24 hours
- Success resets failed_count to 0

Per IP (via scan_attempts table):
- 20 failed attempts across all slugs in 1 hour → block IP for 1 hour

Anti-enumeration:
- Invalid slug and invalid PIN must return the same generic error.
- Invalid slug still shows a PIN form (don't reveal existence).
- Log the IP as a hash, not raw.

## Emergency View — UX Requirements

- Server-rendered HTML. No client JS required.
- Loads in <1s on 3G (target: <50KB total payload).
- No nav, no logo, no signup prompts, no sponsor content.
- One screen: contacts list + optional notes.
- Each contact:
  - Name (large)
  - Relation
  - Big tappable "Call" link (tel:)
  - Big tappable "WhatsApp" link (https://wa.me/<number>)
- Notes section below contacts, if present.
- Pure white background, near-black text, 18px+ minimum font size.
- High contrast for bright sunlight readability.

Example layout:

```
EMERGENCY CONTACTS

Maria Silva — Wife
[ Call ]  [ WhatsApp ]

João Silva — Brother
[ Call ]  [ WhatsApp ]

Notes:
Type 1 diabetic. Allergic to penicillin.
```

## User Dashboard (registered users)

- Auth required (email + password, session cookie).
- CRUD for cards: create, rotate PIN, revoke/deactivate, regenerate slug.
- CRUD for contacts (decrypt → form → re-encrypt on save).
- Optional notes field.
- Download print template (credit card sized).
- Scan activity log: "12 failed attempts from an unfamiliar region in the
  last hour" (derive from scan_attempts).
- Single sponsor slot per page, curated manually. No ad networks.

## PIN Rotation

- Rotating PIN must invalidate all existing view-cookies.
- Bump cards.pin_version. Old cookies fail validation.
- Optionally allow slug regeneration (new QR) for fully lost cards.

## Print Template

- Credit card size: 85.60 × 53.98 mm (ISO/IEC 7810 ID-1).
- Include 3mm bleed, corner cut marks.
- Content:
  - QR code encoding https://<host>/c/{slug}
  - PIN: XXXX printed next to QR (large, readable)
  - Optional: "Scan for emergency contacts" microcopy
  - Optional toggle: "Print without PIN" (user memorizes it)
- Format: single-page PDF, black on white, no color required.
- Double-sided optional (blank back).

## Sponsor Placement

- Dashboard, card creation confirmation, and email receipts only.
- One sponsor slot per page maximum.
- Never on the emergency view.
- Start with manual curation. No ad SDK, no tracking pixels.

## Build Order

1. Astro + Postgres scaffold on Railway
2. Users table, auth, session
3. Cards CRUD, slug generation, PIN set/verify
4. Contact CRUD with pgcrypto encryption
5. Public PIN flow + emergency view
6. Rate limiting + scan log
7. Print template PDF
8. Sponsor slot
9. (Parallel from day 1) First sponsor pilot outreach

## Non-Goals

- No mobile app.
- No structured medical schema (free-text notes only).
- No analytics beyond per-card scan counts.
- No social login for v1.
- No multi-card per user in v1 (one card per account).
- No public profiles, no sharing, no discovery.