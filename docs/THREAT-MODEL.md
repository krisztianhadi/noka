# Threat model

Working document, kept honest as of **2026-10-05** (Phase 9). [PLAN.md](PLAN.md) §3 has the
design-time argument and §17 the weaknesses accepted before the first line of code; this
file is what the built system actually does, including the two things the Phase 9 review
changed. When the code and this file disagree, the code is the bug — unless the code is
the thing that changed on purpose, in which case this file is.

## 1. What is worth protecting

| Asset | Where it lives | Who may read it |
|---|---|---|
| Contact payload: name, relation, phone, channels, spoken languages, "cannot speak or hear" | `contacts.payload`, AES-256-GCM ciphertext, schema-2 JSON | the owner, and a holder of the card's QR + PIN inside the view window |
| Notes | `contacts.notes` (same ciphertext) | same |
| The card's slug and PIN | `cards.slug`, `cards.pin_hash` (Argon2id), `cards.pin_encrypted` | the PIN is readable by the owner on the dashboard; the slug is on the printed card |
| The owner's email | `users.email`, **plaintext** (ADR-004) | the platform and anyone with database read |
| Encryption keyring, HMAC keys, view-cookie secret | environment variables (Railway), never the database | the platform operator |
| Scan metadata: hashed IP prefix, outcome, timestamp | `scan_attempts`, deleted after 30 days | the owner (network counts, no geolocation) |
| Session and view cookies | browser | the browser and whoever holds the device |

The product's own promise fixes the ranking: the contact payload is the thing that must
not leak, and the card is a physical object deliberately handed to strangers.

## 2. Who the adversary is

1. **Someone holding the card who is not the owner.** They have the slug, the printed
   instructions and the languages. They do not have the PIN. This is the main adversary,
   and the product is designed to make them slow: 6 digits, a capped backoff, and a
   per-card counter.
2. **Someone who photographed the card.** Same as above, minus possession.
3. **A hostile page or a curious script on another origin.** Aimed at the owner's session
   and at the guest view: CSRF against the dashboard, an injected script reading the
   responder page, a referrer leaking a card URL to `wa.me`.
4. **A network attacker** on the same wifi as a responder, or a passive observer of
   Railway's edge.
5. **A database-only attacker** — a stolen dump, a leaked backup, a logging pipeline that
   captures query text.
6. **The platform operator** (Railway) or anyone who obtains both the database and the
   environment variables.
7. **A distributed guesser** enumerating slugs (26-character base32) or PINs at many
   cards at once.

## 3. Controls, and where they are

**The responder plane (`/c/*`), which is the one a stranger sees**

- One request, no JavaScript, no third-party request of any kind; `default-src 'none'`
  CSP with `img-src 'self' data:`; asserted per response in `tests/e2e/smoke.spec.ts`.
- `no-store, no-cache, must-revalidate` + `Pragma: no-cache`, so a shared or stolen phone
  cannot show contacts from the back/forward cache after the window closes.
- `Referrer-Policy: no-referrer` — a `wa.me` tap does not hand over the card URL.
- `X-Robots-Tag: noindex, nofollow, noarchive` plus `robots.txt`.
- A generic `<title>`; the owner's name is never in it, so browser history and history
  sync do not carry it.
- No query strings anywhere on the plane; the language switcher is a POST.
- The view cookie is hand-signed (HMAC), `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to
  `Path=/c/{slug}`, and it dies when the PIN rotates or the card is replaced.
- Unknown slug and wrong PIN are indistinguishable in content and in timing (decoy Argon2
  verify, 350 ms floor).
- Rate limiting: a per-card and per-IP counter with a capped backoff and `Retry-After`;
  no permanent lock, so a determined attacker can annoy a legitimate responder but cannot
  lock the card for good.
- Scan attempts are recorded (hashed IP prefix, IPv4 /32 and IPv6 /64), deleted after 30
  days by `scripts/purge.mjs`.

**The owner plane (`/`, `/login`, `/signup`, `/dashboard`, the policy pages)**

- Every POST is same-origin checked (`Origin`, falling back to `Referer`; neither is a
  refusal) — our own check, because Astro's global one would also block the responder's
  PIN form in browsers that omit the header (ADR-014).
- `/dashboard/*` is guarded in middleware; no session, no page.
- Changing the email requires the current password; changing the password ends every
  other session.
- Every write path is transactional under a per-owner advisory lock (five fixes landed
  2026-10-01), and the limits live in the service: 80-character names, 2000-character
  notes, 20 contacts.
- New in this review: a **Content-Security-Policy on the owner plane** (it had none),
  `default-src 'self'` with `form-action 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, and no wildcard or scheme-wide source. `script-src` has to
  allow inline scripts, because Astro inlines the small ones — the landing page's
  reveal-on-scroll ships inside the HTML — so the honest description is: **no origin but
  this one may be loaded, framed, connected to, styled from or posted to**, while a future
  inline script would still run.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(),
  interest-cohort=()` on every plane.
- Sponsors are self-hosted by construction (`src/config/sponsors.ts`), same-origin only,
  `rel="sponsored noopener"`, nothing counted, and structurally unreachable from `/c/*`
  and `/dashboard`.

**Data and secrets**

- AES-256-GCM in the application, not `pgcrypto` (ADR-003); the key never reaches the
  database. A wrong or missing key fails closed and never echoes key material.
- One plaintext exception: the owner's email (ADR-004), because better-auth looks accounts
  up by it. The blind-index design was dropped rather than fought.
- `scan_attempts` holds HMAC'd IP prefixes, never raw addresses.
- pino redaction covers `payload`, `pin`, `phone`, `phone_e164`, `notes`, `password`, the
  request cookie and the authorization header, including nested (`*.phone`). Asserted on
  the bytes pino writes in `tests/unit/logger.test.ts`.

## 4. Two findings from the Phase 9 review (2026-10-05)

**The owner plane had no CSP at all.** PLAN §5 specified the responder plane's headers and
nothing else, so the surface that renders owner-written text (contact names, notes) and
runs the only client script in the project was unprotected. Fixed in `src/middleware.ts`;
asserted for six paths and for the absence of CSP console errors in the e2e suite.

**Astro's error logging is not pino's.** An unhandled route error is logged by Astro with
its own logger, so the redaction paths do not apply to that output — measured by throwing a
deliberate error carrying a phone number: the page showed nothing (`/500` renders copy, no
message, no stack, no identifier), and the log contained the message verbatim. The
containment is therefore not a filter but a rule: **no throw site may interpolate user
data**. Audited 2026-10-05 — the nine `throw new Error` sites interpolate key versions,
payload schema versions, limits, a card id and config names; the single `getLogger()` call
site passes an error object and a card id. Any future throw that includes a phone number,
a name or a note puts it in the log.

Not a finding, but recorded because it looks like one: `astro dev` prints
`Failed to run dependency scan … PARSE_ERROR` for a virtual module of
`DashboardBehavior.astro`. It is a dev-only pre-bundling warning (Vite 8/rolldown); the
pages render and the production build is clean.

## 5. Accepted weaknesses

PLAN §17 stands, unchanged: one factor plus a secret; holding the card and knowing the PIN
*is* the product; phone numbers are unverified; `EMAIL_LOOKUP_KEY` and `IP_HASH_KEY` are
not rotatable in v1; printed cards are unchangeable and die without notice; a scan is not
an alert; a distributed guesser meets the per-card counter; the responder language set is
the owner's choice; IP limits can be wrong behind CGNAT.

Additions from this review:

- **The platform operator is inside the trust boundary.** The database holds ciphertext,
  but the keyring is an environment variable on the same platform, so a Railway-level
  attacker (or a subpoena to Railway) has both halves. The encryption defends against a
  database dump, a backup, a log pipeline and a curious DBA — not against the host.
- **Inline scripts are allowed on the owner plane** (see §3). Anyone who can already
  inject markup into an owner page gets script execution; what they cannot get is a
  request to another origin.
- **The dev server is not a hardened surface.** `pnpm dev` serves source maps and Vite's
  client; it is a local tool, never exposed.
- **`/demo` is public and unauthenticated** by design: invented people, a constant PIN,
  and a code path that deliberately does not touch the cards table. It shares the owner
  plane's headers, not the responder's.

## 6. The one thing that would change the design

If the keyring ever has to be rotated for real (`D23`), v1 has no re-encryption pass: the
keyring is versioned and new writes can use a new version, but existing rows need a
migration that decrypts and re-encrypts. Until that exists, a suspected key compromise
means an outage, not a rotation. Breach procedure in [SETUP.md](SETUP.md).

## 7. How the claims are checked

| Claim | Where it fails if broken |
|---|---|
| The responder plane carries no script and no external request | `tests/e2e/smoke.spec.ts` (headers, `externalResources`, `unexpectedNavigations`) |
| Unknown slug and wrong PIN are indistinguishable | `tests/e2e/responder.spec.ts` ("an unknown slug looks exactly like a locked card"), `tests/integration/responder.test.ts` |
| The limiter caps and releases | `tests/integration/limiter.test.ts` (50 concurrent attempts included) |
| The purge deletes exactly the expired rows | `tests/integration/retention.test.ts` |
| No plaintext in the database | `tests/integration/db.test.ts` ("stores an encrypted contact and reads back no plaintext"), `tests/integration/responder.test.ts` |
| Log lines carry no decrypted value | `tests/unit/logger.test.ts` |
| The owner plane allows no other origin | `tests/e2e/smoke.spec.ts` (header + console check) |
| Sponsors cannot reach the card or the dashboard | `tests/unit/sponsors.test.ts`, `tests/e2e/smoke.spec.ts` |
| Same-origin POSTs only | `tests/unit/http-origin.test.ts`, `tests/integration/auth.test.ts` |
