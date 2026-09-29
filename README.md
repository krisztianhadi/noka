# noka

**next of kin access** — an emergency contact card. A printed ISO ID-1 card
(bank-card size) carries a QR code and a six-digit PIN. Anyone who finds it
scans, enters the PIN, and sees the people to call: name, relation, and two
big buttons — *Call* and *WhatsApp* — on a page that renders in one request,
without JavaScript and without an app.

Status: **pre-release.** The whole journey works locally. Nothing is deployed,
nothing is printed, and the PIN endpoint is not yet rate-limited — see
[What's next](#whats-next).

## Why this exists

This is a more elegant way to keep a handwritten post-it in my wallet. That is
the whole product idea, and it is worth stating plainly because it sets the bar:
the post-it already works. It needs no battery, no account and no trust.

What the post-it cannot do is carry twelve phone numbers, be read by someone who
does not speak the language it is written in, or be updated when a contact
changes. What it should never do is leak the people on it to whoever picks up the
wallet.

So the design problem is narrow. A stranger in the street has ten seconds and a
phone that may be nearly out of battery. The owner wants the data encrypted, no
tracking, and no account to keep alive. Everything below serves those two
sentences.

## How it works

Two planes that never mix ([PLAN.md](docs/PLAN.md) §3).

- **Guest plane** — `/c/{slug}`. The card's QR carries a 128-bit random slug
  (26 characters, Crockford base32). The page asks for the six-digit PIN printed
  next to the QR, sets a signed 15-minute cookie scoped to that one card, and
  renders the contacts. Zero JavaScript, zero third-party requests, no fonts to
  download, no query strings to leak into a log.
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

**What is honest about that:** the slug and the PIN are printed on the same
physical object, so this is one factor plus a secret, not two independent
factors. Someone who photographs the card has the slug and needs only the PIN.
What protects that case is the limiter plus the PIN's entropy: with the planned
backoff, roughly 4–5 guesses per card per week, which is about 3,800 years to
walk the space. Rotating IPs does not help, because the card-level counter is
global to the card.

**What actually protects the data itself:** the encryption key is never in the
database. Contact payloads and notes are AES-256-GCM with the key kept in the
environment, so a stolen dump, a stolen backup or read access to Postgres yields
ciphertext — whatever happens to the PIN. That is the boundary that matters, and
it is deliberately not the PIN.

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
- **Monetization is deferred wholesale** — no pricing, no payments, no
  impression counting.
- **No permanent lock on the PIN.** A printed URL must not be able to brick a
  safety feature.

## What's next

1. **Rate limiting on the PIN endpoint (Phase 6).** The library and its Postgres
   store are chosen and proven under load (ADR-016); nothing calls them from the
   responder flow yet. Until this lands, a scripted attacker can walk six digits.
2. **Print (Phase 7).** Server-rendered preview, card-size PDF, A4 10-up sheet,
   deterministic reprints (ADR-017), then a physical print-and-scan test with
   three phones. A product that lives on a card is not done until a card exists.
3. **Google sign-in and password reset.** Both need credentials only the owner
   can create: a Google Cloud OAuth client and a Resend sending domain.
4. **Hardening and launch (Phase 9).** Threat-model document, header review,
   restore drill, privacy and ToS pages, export and delete.

## Quick start

```sh
# 1. Postgres 16 on 5433 (5432 belongs to another project on this machine)
docker run -d --name noka-db \
  -e POSTGRES_USER=noka -e POSTGRES_PASSWORD=noka -e POSTGRES_DB=noka \
  -p 5433:5432 postgres:16-alpine

# 2. Environment
cp .env.example .env
openssl rand -base64 32   # repeat for VIEW_COOKIE_SECRET, BETTER_AUTH_SECRET,
                          # CONTACT_ENCRYPTION_KEY, EMAIL_LOOKUP_KEY, IP_HASH_KEY
pnpm install
pnpm db:migrate

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

## Tests, and what they prove

149 Vitest cases and 19 Playwright cases on the last green run.

- **Encryption** — round-trip, tamper detection, wrong key, key versions, and a
  raw `SELECT` in the integration suite that shows no plaintext.
- **The responder plane** — a stranger in a separate browser context: a wrong PIN
  gets a generic error, the right PIN gets the contacts, the language switch
  works, *Hide now* closes it, and `/view` is unreachable afterwards.
- **Anti-enumeration** — an unknown slug renders a byte-identical page and
  answers POSTs in the same time (350 ms floor, decoy Argon2 verification).
- **The database rules** — one active card per owner, cascade deletes, and the
  last contact on an active card cannot be deleted.
- **Accessibility** — axe on the landing, auth, card, contacts and notes pages,
  and on both responder pages.
- **Determinism** — two renders of the same PDF page are byte-identical.

## Deployment

Railway builds the `Dockerfile` on `node:22-alpine`; `railway.json` runs the
migrations through `scripts/migrate-on-start.mjs` (advisory-locked, so parallel
replicas are safe) before starting the server, and healthchecks `/healthz`. The
image has been built and run locally against Postgres, including a signup that
stored an Argon2id hash — which is what proves the native module works on musl.

## Project documents

- [docs/PLAN.md](docs/PLAN.md) — the build contract: 31 decisions, threat model,
  schema, phases, endpoint contract, environment.
- [docs/DECISIONS.md](docs/DECISIONS.md) — the ADRs, including the decision this
  project reversed, and the ones still open.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit.
- [docs/API.md](docs/API.md) — every route with built/planned status.
- [docs/SETUP.md](docs/SETUP.md) — services, ports, credentials, breach procedure.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — dated, tagged, newest first.
- [docs/blog/](docs/blog/) — the development log and the post drafts.
- [docs/ORIGINAL_BRIEF.md](docs/ORIGINAL_BRIEF.md) — the first spec, kept as a
  historical document because the plan later disagreed with it.

## Licence

Not chosen yet — and deliberately named here rather than left implicit. See
[DECISIONS.md → Open decisions](docs/DECISIONS.md).

## Built with AI

Hand-written and AI-enhanced: the specification, the decisions and the review are
mine; the implementation is written in pair with DeepSeek V4.1 Flash in DeepSeek
Harness. The commit history, the ADRs and the devlog say which parts came from
where.
