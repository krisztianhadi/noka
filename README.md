# noka

**next of kin access** — an emergency contact card. A printed ISO ID-1 card
(bank-card size) carries a QR code and a six-digit PIN. Anyone who finds it
scans, enters the PIN, and sees the people to call: name, relation, and two
big buttons — *Call* and *WhatsApp* — on a page that renders in one request,
without JavaScript and without an app.

Status: **pre-release.** The journey works locally; nothing is deployed or printed,
and the PIN endpoint is not rate-limited yet — see [What's next](#whats-next).

## Why this exists

This is a more elegant way to keep a handwritten post-it in my wallet. That is
the whole product idea, and it is worth stating plainly because it sets the bar:
the post-it already works. It needs no battery, no account and no trust.

What the post-it cannot do is carry twelve phone numbers, be read by someone who
does not speak the language it is written in, or be updated when a contact
changes. What it should never do is leak the people on it to whoever picks up the
wallet.

So the design problem is narrow: a stranger in the street has ten seconds and a
phone that may be nearly out of battery, and the owner wants the data encrypted,
no tracking and no account to keep alive. Everything below serves those two
sentences.

## How it works

Two planes that never mix ([PLAN.md](docs/PLAN.md) §3).

- **Guest plane** — `/c/{slug}`. The QR carries a 128-bit random slug (26
  characters, Crockford base32); the page asks for the printed six-digit PIN, sets
  a signed 15-minute cookie scoped to that one card, and renders the contacts.
  Zero JavaScript, zero third-party requests, no fonts, no query strings.
- **Owner plane** — `/dashboard`. Email and password (or Google), server-rendered
  forms, one card per account, contacts and notes editable, the card reprintable
  for as long as it is active.

The card's own language set drives the responder page: the same five languages
(EN / ES / FR / ZH / RU) are used for the printed instructions and for the page,
so a card cannot be printed in a language its page cannot speak.

## The threat model, in plain words

**What stands between a stranger and the data**

1. **The slug** — 128 bits of CSPRNG. Guessing it is not a threat model; leaking
   it is (a photograph, a screenshot, an access log).
2. **The PIN** — six digits, verified against Argon2id.
3. **The rate limiter** — which is what makes (2) meaningful, and which is
   **not wired up yet** (Phase 6).

**What is honest about that:** the slug and the PIN are on the same piece of
plastic, so it is one factor plus a secret, not two independent factors. Anyone who
photographs the card has the slug and needs only the PIN — what protects that case
is the limiter plus the PIN's entropy: with the planned backoff, roughly 4–5 guesses
per card per week, about 3,800 years to walk the space, and rotating IPs does not
help because the counter belongs to the card.

**What actually protects the data itself:** the encryption key is never in the
database. Contact payloads and notes are AES-256-GCM with the key kept in the
environment, so a stolen dump, a stolen backup or read access to Postgres yields
ciphertext — whatever happens to the PIN. That is the boundary that matters, and
it is deliberately not the PIN.

The spec asked for `pgcrypto`, encryption inside Postgres; it moved into the
application (ADR-003), where a per-row key derivation is off the responder page's
hot path and the key never becomes something the database knows. The one plaintext
exception is the owner's email, because the auth library looks accounts up by it
(ADR-004) — written down rather than glossed over.

**What a responder leaves behind:** an audit row with an HMAC'd IP prefix, never
a raw address. A scan is not an alert, and nothing tells the owner in real time.

## What is deliberately not here (v1)

- **No mobile app.** A wallet card and a web page; nothing to install.
- **No structured medical fields.** Free-text notes, the owner's own liability.
- **No analytics on the responder page.** Not a pixel, not a beacon.
- **No sponsor content on `/c/*` or `/dashboard`.** Sponsor logos are static,
  self-hosted, and live on the landing and auth pages only.
- **One card per account**, no public profiles, no sharing, no discovery.
- **The dashboard and the landing are English only.** The responder page and the
  printed card are not.
- **No permanent lock on the PIN.** A printed URL must not be able to brick a
  safety feature.

## Who pays for it

**Users are never charged.** Not a free tier with a paid upgrade, not a trial,
not a "pro" plan — an emergency card that stops working when a subscription
lapses is worse than the post-it it replaces.

- **Project sponsors** — static, self-hosted logos on the landing and auth pages.
  Never on `/c/*`, never a script, never a pixel, never an impression counter.
- **Whitelabel** — a partner running an instance under their own brand and paying
  for hosting, customisation and support. MIT already grants the permission, so
  permission is not what is sold.
- **User data is never sold, shared or brokered** — not raw, not aggregated, not
  "anonymised insights". The contacts are unreadable by design, and the email and
  metadata around them are not for sale either.
- **The product is never sold into closed source.** If someone offers to buy it
  and run it as proprietary software, the answer is no. Anyone may fork it
  (MIT); nobody may take this one away.

The full policy, including what MIT does and does not enforce, is PLAN §18 and ADR-019.

## What's next

1. **Rate limiting on the PIN endpoint (Phase 6).** The store is chosen and proven
   under load (ADR-016), but nothing calls it from the responder flow yet. Until
   this lands, a scripted attacker can walk six digits.
2. **Print (Phase 7).** Preview, card-size PDF, A4 10-up sheet, deterministic
   reprints (ADR-017), then a print-and-scan test with three phones. A product
   that lives on a card is not done until a card exists.
3. **Google sign-in and password reset** — both need credentials only the owner
   can create: a Google Cloud OAuth client, a Resend sending domain.
4. **Hardening and launch (Phase 9).** Threat model, header review, restore drill,
   privacy and ToS pages, export and delete.

## Quick start

```sh
# 1. Postgres 16 on 5433 (5432 belongs to another project on this machine)
docker run -d --name noka-db -p 5433:5432 \
  -e POSTGRES_USER=noka -e POSTGRES_PASSWORD=noka -e POSTGRES_DB=noka postgres:16-alpine

# 2. Environment: fill .env with `openssl rand -base64 32` per secret
cp .env.example .env && pnpm install && pnpm db:migrate

# 3. Development
pnpm dev          # http://localhost:3200
```

The dev server binds on all interfaces, so a phone on the same network can open a
card URL — which is the only honest way to test a responder page.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Astro dev server on :3200 |
| `pnpm build` / `pnpm start` | Production build, then run `dist/server/entry.mjs` |
| `pnpm typecheck` | `astro check` across every file, tests included |
| `pnpm test` | Vitest unit + integration (integration needs Postgres) |
| `pnpm test:e2e` | Playwright against the built server, axe included |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `node scripts/usage-report.mjs` | Token usage for this workspace, read from the harness logs |

## Tests, and what they prove

149 Vitest cases and 19 Playwright cases on the last green run.

- **Encryption** — round-trip, tamper detection, wrong key, key versions, and a
  raw `SELECT` in the integration suite that shows no plaintext.
- **The responder plane** — a stranger in a separate browser context: wrong PIN
  gets a generic error, the right PIN gets the contacts, the language switch works,
  *Hide now* closes it, `/view` is unreachable afterwards.
- **Anti-enumeration** — an unknown slug renders a byte-identical page and
  answers POSTs in the same time (350 ms floor, decoy Argon2 verification).
- **The database rules** — one active card per owner, cascade deletes, and the
  last contact on an active card cannot be deleted.
- **Accessibility** — axe on the landing, auth, card, contacts, notes and both
  responder pages.
- **Determinism** — two renders of the same PDF page are byte-identical.

## Deployment

Railway builds the `Dockerfile` on `node:22-alpine`; `railway.json` runs migrations
through the advisory-locked `scripts/migrate-on-start.mjs` before starting the
server, and healthchecks `/healthz`. The image has been built and run against
Postgres, signup included — proof the Argon2id module works on musl.

## Project documents

- [docs/PLAN.md](docs/PLAN.md) — the build contract: 32 decisions, threat model,
  schema, phases, endpoint contract, monetization policy, environment.
- [docs/DECISIONS.md](docs/DECISIONS.md) — 19 ADRs, including the decision this
  project reversed and the commitments it will not break.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [API.md](docs/API.md) ·
  [SETUP.md](docs/SETUP.md) · [CHANGELOG.md](docs/CHANGELOG.md) · [COSTS.md](docs/COSTS.md)
  — the shape, the routes, the services, the history, the bill.
- [docs/blog/](docs/blog/) — the development log, and the post drafts built on it.
- [docs/ORIGINAL_BRIEF.md](docs/ORIGINAL_BRIEF.md) — the first spec, kept because
  the plan later disagreed with it.

## Licence

MIT — [LICENSE](LICENSE). Chosen because the useful version of this idea is one
other people can self-host, fork and print without asking me: an emergency card
that only works on my server is a worse product than one that can be run
anywhere. The reasoning is ADR-018 in [docs/DECISIONS.md](docs/DECISIONS.md).

## Built with AI

Hand-written and AI-enhanced: the specification, the decisions and the review are
mine; the implementation is written in pair with DeepSeek V4.1 Flash in DeepSeek
Harness. The commit history, the ADRs and the devlog say which parts came from
where.
