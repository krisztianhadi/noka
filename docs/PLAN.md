# noka — technical specification and build plan (v1)

Status: pre-code. Moved to this workspace 2026-09-29; the git repo exists
(`main`, no commits yet) and holds only `docs/`. Source: the technical spec
([ORIGINAL_BRIEF.md](ORIGINAL_BRIEF.md), now a historical document — this file
supersedes it) plus the clarifications given 2026-09-29. This file is the build
contract.

At Phase 1 it splits per the project-docs method: decisions and threat model →
`docs/ARCHITECTURE.md`, §15 → `docs/API.md`, §16 → `docs/SETUP.md`, §11 →
`docs/CHANGELOG.md` entries, and `docs/INDEX.md` links all of them. README
(<200 lines) lands in the same commit as the scaffold.

**Clarifications that supersede the original pasted spec**

1. Rate limiting: industry-standard approach, not the spec's ad-hoc ladder. → §6
2. Owner login and QR access are **two separate authentication planes**. Guest = QR + PIN, read-only, time-limited. Owner = email/password or Google, with forgot-password. → §3
3. All contact data encrypted; readable only by the owner (edit) and by a QR+PIN holder inside the time window. **No leaks.** → §4, §5
4. Lightweight is a requirement, the public card more than the app. Must work on bad mobile internet. → §9
5. Print: standard ID-1, portrait *artwork* on a normal landscape card, QR + PIN + language instructions. Preview first, then downloads. → §7
6. Medical specifics out of scope; best-effort GDPR. → §8
7. The card stays **re-downloadable and reprintable from the owner's account for as long as it is valid**. → D9, §7
8. Security = the QR's high-entropy slug + the PIN + rate limiting. Not a vault, but not crackable in practice. → §3
9. Print languages: **EN / ES / FR / ZH / RU** for now. Later the owner picks the five at card generation. → D15
10. The **responder pages carry the same language set as the card**, so a card whose instructions are Chinese never lands on an English page. → D19, D20, §3
11. **Every contact carries its own spoken languages**, so a responder who speaks one language can see who to call. → D17, §4
12. **Monetization does not involve charging users.** Static sponsor logos on the
    landing and auth pages; nothing on `/c/*`. The full policy — sponsors,
    whitelabel, no data selling, never closed-source — is §18. → D18, D32
13. **Encryption moved out of PostgreSQL.** The spec asked for `pgcrypto`; the
    project does AES-256-GCM in the application with a keyring and `key_version`,
    so the key never reaches the database and the per-row key derivation stays
    off the responder page's hot path. → D1, §4, ADR-003
14. **The owner's email is the one plaintext exception.** The auth library looks
    accounts up by it, so the blind-index design was dropped rather than fought.
    → ADR-004, §4
15. **The card has no switch.** Activation and deactivation are gone: a card is
    live when it is made, and "New card" replaces the separate new-PIN and new-QR
    actions by replacing the card itself. A card cannot exist without a contact.
    → ADR-020, supersedes parts of D9 and D28
16. **Contacts carry reachability channels** — call, text, WhatsApp, Signal,
    Telegram, Viber; call on by default, text because it is what works for a
    responder who cannot speak or hear. The responder page shows buttons for the
    reliable schemes and a readable "available on" line for the rest.
    → ADR-021, §4
17. **Contacts and notes belong to the owner**, not to the card, so the order is
    contacts → notes → card and reissuing a card never touches the people. The
    owner plane is a single page. → ADR-022, ADR-020, §7
18. **Deleting the last contact deletes the card with it**, after a confirmation
    that says so. A printed card behind an empty page is worse than no card.
    → ADR-020
19. **Every channel is a button on the responder page**, and the number is shown.
    → ADR-025, supersedes the button/line split of ADR-021
20. **Account settings are immediate** (email on the row, password through the
    library), because there is no mailer to confirm an address with yet; a
    password change ends every session. → ADR-023
21. **Dark mode is server-rendered from a cookie**, and the responder page never
    reads it. → ADR-024
22. **JavaScript, custom fonts and icons are owner-plane only.** The no-JS,
    self-contained rule of D6 still governs `/c/*` and nothing else; the owner
    plane uses a real `<dialog>` modal for destructive actions and vendored Noto
    for the card. → ADR-026, ADR-027

---

## 1. Verdict on the original spec

The foundations are right: unguessable slug as identifier, hashed PIN, signed
scoped cookie, IP hashing, anti-enumeration, zero-JS public page. Seven things were
wrong or missing and are corrected in this document:

1. The PIN-lockout ladder could not be expressed in the given schema, had undefined
   tier-reset semantics, and contained a read-then-write race. → §6
2. A printed card URL alone could lock the owner's card out for 24 h — permanent
   lockout on unauthenticated input is a DoS on a safety feature. → §6
3. The public page had no exposure controls: no `no-store`, no
   `Referrer-Policy: no-referrer` (the WhatsApp link leaks the card URL to Meta in
   `Referer`), no `noindex`, no `robots.txt` block. → §5
4. **The owner could not reprint a card**, because only `pin_hash` was stored. → D9
5. Email was assumed by the sponsor section but never specified, and there was no
   password-reset path at all. → D4
6. **The responder page had no language at all** while the card is printed in five:
   a card with Chinese instructions led to an English page. The identity was also
   never collected, although the card and the page both show the owner's first
   name. → D19, D27
7. **Contacts carried no spoken languages**, so the one thing a responder needs
   first — who can I actually talk to — was missing. → D17

---

## 2. Decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | **App-side AES-256-GCM** for all contact data, `key_version` column. No pgcrypto. | locked — a per-row KDF on the hot path breaks the bad-network budget; app crypto is µs |
| D2 | PIN = **6 digits**. | locked |
| D3 | **Exponential backoff, no permanent lock**; per-IP hard block. | locked |
| D4 | Transactional email via **Resend**: verification, forgot password, address change, security notices. Sending domain verified with SPF/DKIM/DMARC. | locked |
| D6 | Dashboard = **SSR forms, zero islands, no client framework**. | locked |
| D7 | **One card per account** in v1 (the spec contradicted itself); partial unique index. | locked |
| D8 | Owner auth via **better-auth** (official Astro example: email+password, Google, reset, DB sessions) rather than hand-rolled OAuth. Phase 0 confirms versions and the schema it owns. | recommended |
| D9 | **`pin_encrypted` alongside `pin_hash`**, so the owner can view, download and reprint the card as many times as they like. *(Amended by ADR-020: there is no deactivated state any more — "New card" replaces the card, and the old one stops resolving.)* | amended |
| D10 | One encrypted **JSON payload per contact**; only `sort_order` stays plaintext. | recommended |
| D11 | Owner **email at rest**: `email_hash` (HMAC, unique, for lookup) + `email_encrypted`. A DB dump contains no plaintext address. | recommended |
| D12 | Rate-limit state in **Postgres** via `rate-limiter-flexible`; no Redis in v1. | recommended |
| D13 | Slug = 16 random bytes as **uppercase Crockford base32**, keeping the QR in alphanumeric mode and on a lower version. | recommended |
| D14 | Guest view cookie: **absolute 15 min**, no sliding renewal, plus an explicit "Hide" POST link (zero JS). | locked |
| D15 | Print language set stored **per card** (`languages text[]`), default EN/ES/FR/ZH/RU. The picker UI is a planned later feature; the schema and the print template accept a variable set from day one. | locked |
| D16 | **Reprint is deterministic**: same slug, same PIN, same layout, same language set. A reprint is byte-comparable to the original for the same card revision. Enforced by test, not by hope — see D29. | locked |
| D17 | **Spoken languages per contact** (`spoken_languages: string[]`, BCP 47 codes) inside the encrypted payload, rendered on the responder view in the responder's own UI language. | locked |
| D18 | **Sponsors = static self-hosted logos on the landing and auth pages only.** No pricing, payments, invoices, impressions or tracking in v1; never on `/c/*` or `/dashboard`. | locked |
| D19 | **Responder pages are localised into the card's own language set.** `Accept-Language` ∩ set, falling back to `languages[0]`; a zero-JS `POST /c/{slug}/lang` switches it. Never a query string. | locked |
| D20 | **One message catalogue** (`src/i18n/`) drives the responder UI, the PIN/error pages and the printed instructions. The build fails on a missing or empty key. | locked |
| D21 | **System fonts only, CJK included.** No webfont anywhere in `/c/*`, Latin or Chinese. | locked |
| D22 | **Secrets are separated per purpose**: `VIEW_COOKIE_SECRET` (guest cookie), better-auth's own secret (owner plane), `CONTACT_ENCRYPTION_KEY`, `EMAIL_LOOKUP_KEY`, `IP_HASH_KEY`. The spec's single `SESSION_SECRET` is dropped; the inventory is §16. | locked |
| D23 | **Rotation policy:** `CONTACT_ENCRYPTION_KEY` rotates through the keyring; `EMAIL_LOOKUP_KEY` and `IP_HASH_KEY` are **not rotatable in v1** — the first needs a full rehash pass, the second resets limiter history. Recorded as a known limit, not solved. | locked |
| D24 | **Retention purge is a Railway cron service** running a script (`pnpm purge`), not an HTTP endpoint. No admin surface to protect. | recommended |
| D25 | **`scan_count` counts successful PIN unlocks only.** `scan_attempts` records PIN failures and successes (`kind`), never page loads — a bot hammering the form is the limiter's problem, not the audit table's. | locked |
| D26 | **IP keying: full IPv4 address (/32), IPv6 /64.** The spec's /24 bucket is dropped — on CGNAT it blocks unrelated people, which is the DoS §1.2 was written to avoid. | locked |
| D27 | **The owner's first name is captured at signup**, prefilled from the Google profile on OAuth, editable in the dashboard, optional — absent means the header is omitted, never a placeholder. | locked |
| D28 | **The last contact cannot be deleted while the card is active.** Deactivate first; no silently empty emergency card. | locked |
| D29 | **Byte-deterministic PDFs**: fixed CreationDate/ModDate, no random document `/ID`, stable object order and font subsetting, asserted by a byte-comparison test. | locked |
| D30 | **Card visual identity** — typography, spacing, header treatment, the printed mark — is one design, decided and reviewed as an image before Phase 7. Extra card designs stay later. | open |
| D31 | **`relation` is a fixed vocabulary, never free text** — `spouse`, `partner`, `parent`, `sibling`, `child`, `friend`, `other` — validated on write, rendered in the responder's language. There is no formal standard to follow (RFC 6350's `RELATED` types are social, not emergency); this is the emergency-card norm, gender-neutral, with `other` as the escape hatch. | locked |
| D32 | **Users are never charged, ever.** The product is paid for by project sponsors or whitelabel arrangements; user data is never sold, and the project is never sold into closed source. Full policy: §18, ADR-019. | locked |

**Needed before the first printed card (not blocking code):** the production
origin baked into every QR (`PUBLIC_CARD_ORIGIN`). Keep it short — every URL
character is QR density. D30 is decided the same way: as an image, before the
print pipeline is written. Deferred items are listed in §14.

---

## 3. Access model — two planes, never mixed

**Plane A — guest (QR + PIN).** Read-only, no account, no session sharing.
`GET /c/{slug}` → PIN form (no contact data in the HTML). `POST /c/{slug}` →
rate-limit check → verify → signed cookie `{slug, pin_version, exp}` →
`GET /c/{slug}/view` → decrypt → render → discard. Cookie is absolute-15-minute,
`HttpOnly`, `Secure`, `SameSite=Lax` (strictest value that survives the redirect),
`no-store`, and validated against the DB on every view for `slug`, `pin_version`
**and** `active`.

**Responder language (D19, D20).** A responder is a stranger who may not read
English, so the guest plane is localised into the card's own language set — the
same ordered array the print template uses, first entry = default.

- **Selection:** `Accept-Language` negotiated against `cards.languages`. No match
  → `languages[0]` → `en`. Never inferred from the owner's session, never from a
  query string (§5).
- **Switch:** a zero-JS `<form method="post" action="/c/{slug}/lang">` with one
  button per language. The POST sets a `lang` cookie and 303s back to the current
  step (the view when unlocked, the PIN form otherwise).
- **Cookie:** `Path=/c/{slug}`, `HttpOnly`, `Secure`, `SameSite=Lax`,
  session-scoped, cleared by the same "Hide" POST that clears the view cookie. A
  language choice on one card must never change another card's page (tested).
- **Localised surfaces:** the PIN page (title, prompt, error, button), the view
  (headings, `Call`, `WhatsApp`, notes, Hide) and the 429 page. One catalogue, and
  a missing key fails the build instead of silently rendering English.
- **Not translated:** the owner's and the contacts' own names, and the notes text —
  those are the owner's words. The **relation is a code, not a phrase** (D31), so it
  *does* render in the responder's language.
- **Anti-enumeration:** `POST /c/{slug}/lang` on an unknown, deactivated or revoked
  card returns the same redirect as a live one; only the code is validated. No
  existence oracle, here either.
- **Stale cookie:** a language the card no longer offers falls back to
  `languages[0]` rather than erroring — the owner may have changed the set.
- Print instructions and the responder page read the **same catalogue**, so a
  language is added in one place and a card cannot be printed in a language its
  own page cannot speak.

**Plane B — owner (account).** better-auth session cookie, DB-backed and
revocable. Email + password (argon2id) **or** Google OAuth. Forgot-password via
Resend. Google scopes limited to `openid email profile` — non-sensitive, so no
Google verification review. Account-linking rule: an OAuth sign-in may claim a
same-address password account only if that account is verified; unverified
password accounts are provisional and claimable, the standard pre-hijack
mitigation.

**Isolation rules, each one a test:**
- A Plane B cookie must never open `/c/*`; a Plane A cookie must never open `/dashboard/*`.
- `/dashboard/card/preview` renders the emergency component for the owner from the
  owner session at a distinct path — the guest URL is never reused for preview.
- `/c/{slug}/view` with no valid cookie falls back to the PIN form, never an error.
- Rotating the PIN bumps `pin_version` → every live view cookie dies.
- Deactivating the card stops `/view` serving data even with a live cookie, and
  stops the print/download endpoints too (D9).
- A revoked owner session dies server-side, not just in the browser.
- The guest plane never reads the owner session for anything, language included;
  the language cookie is path-scoped per card and cannot bleed between cards.

### The actual security argument

The claim is deliberately modest and it is the true one. Three things stand
between a stranger and the contact data:

1. **The slug** — 128 bits of CSPRNG, half of a Crockford base32 pair; guessing it
   is not a threat model, only *leaking* it is (photographing the card, a screenshot,
   an access log).
2. **The PIN** — 6 digits, verified against argon2id, gated by the §6 limiter.
3. **The rate limiter**, which is what makes (2) meaningful.

Honest framing: the slug and the PIN are printed on the *same physical object*, so
this is one factor plus a secret, not two independent factors. Someone who
photographs the card has the slug and needs only the PIN. What protects that case
is the limiter plus the PIN's entropy:

- Per-card backoff bites from the 5th failure and the counter decays only after
  **7 days** with no failures → roughly 4–5 guesses per card per week.
- 10⁶ PINs ÷ 5 guesses per week ≈ **3,800 years** to exhaust the space. Rotating
  IPs does not help, because the card-level counter is global to the card, not per IP.
- A successful PIN entry inside the 15-minute window is the only way to read the
  data through the app, and it is logged.

And separately, the thing that protects the data *itself*: **the encryption key is
never in the database.** A stolen dump, a stolen backup, or read access to
Postgres yields ciphertext, whatever happens to the PIN. That is the boundary that
matters, and `docs/ARCHITECTURE.md` will say so in those words so nobody later
mistakes the PIN for the wall.

Explicitly accepted weakness: anyone holding the physical card and knowing the PIN
can read the contacts. That is the product.

---

## 4. Encryption

- **Algorithm:** AES-256-GCM per record, random 96-bit IV per write, auth tag
  stored with the ciphertext. Node `crypto`, no extra dependency.
- **Shape:** `contacts.payload_encrypted` = JSON `{schema:2, name, relation,
  phone_e164, phone_display, spoken_languages:[…]}`. One blob per contact: no
  metadata leaked by column names, and new fields need no migration.
  `card_notes.notes_encrypted` likewise.
- **Schema versions:** an unknown `payload.schema` is a hard error, never a
  partial render. v2 is the only version ever written; a v1 row (there are none
  yet) would be upgraded on next edit, not at read time.
- **Spoken languages:** codes from the catalogue's fixed vocabulary, never free
  text — the responder must never see an unlabelled string. Validated on write;
  the list renders in the responder's UI language.
- **Relation:** one of the seven codes of D31, likewise validated on write. Anything
  beyond "other" is narrative, and the notes are where narrative belongs.
- **Key:** `CONTACT_ENCRYPTION_KEY` (32 random bytes, base64) as a Railway
  variable, mirrored in his password manager. Never in the repo, the DB, a log, or
  an error message. Full secret inventory and separation rule: D22, §16.
- **Rotation ready:** `key_version smallint` on every encrypted row, and a keyring
  `{1: key}` in the app, so a v2 key can be introduced and rows re-encrypted in a
  background pass with no downtime. The re-encryption pass is a later task (§13),
  not v1 work — the keyring exists from day one so it stays possible.
- **Not rotation-ready, deliberately (D23):** `EMAIL_LOOKUP_KEY` and `IP_HASH_KEY`.
  Rotating the first requires rehashing every user in one pass; rotating the second
  resets all limiter state. Both are recorded in §17 rather than solved.
- **Email:** `email_hash = HMAC-SHA256(email_normalised, EMAIL_LOOKUP_KEY)` for the
  unique lookup, `email_encrypted` for display and sending. Login and
  forgot-password still work; the DB holds no email list. An email **change**
  rewrites both columns in one transaction, or the account locks itself out.
- **Open risk, Phase 0:** D11 removes the plaintext `email` column that
  better-auth's default user model owns. Phase 0 proves a custom adapter or hook
  can still drive email+password, Google and reset; if it cannot, D11 is dropped
  and the ADR says why. → §11 Phase 0
- **Startup check:** fail fast if a key is missing; round-trip one encrypt/decrypt
  against the DB before serving traffic.
- **Handling rule:** decrypt in memory, render, discard. Never cached, never
  logged, never sent to error tracking. pino redaction covers `payload`, `pin`,
  `phone`, `notes`.
- **Out of scope:** per-user keys, KMS envelope encryption, PIN-derived per-card
  keys. The last is impossible anyway — the owner must edit contacts without
  entering the PIN.
- **Not used:** `pgcrypto` (no extension dependency, no deployment permission risk).

---

## 5. Exposure controls — "no leaks"

| Control | Value | Why |
|---|---|---|
| `Cache-Control` | `no-store, no-cache, must-revalidate` + `Pragma: no-cache` | a lost or shared phone must not show contacts from the back/forward cache after expiry |
| `Referrer-Policy` | `no-referrer` | `wa.me` would otherwise receive the card URL in `Referer` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` | never indexed; plus `robots.txt: Disallow: /c/` |
| CSP | `default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` | the page needs no scripts, fonts or images; `tel:`/`wa.me` are links, not fetches |
| `X-Content-Type-Options` | `nosniff` | baseline |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | baseline |
| Third-party requests | **zero** — no CDN, no font service, no analytics, no pixel, no external image | every one of them is a leak channel and a round trip |
| `<title>` on `/c/*` | generic, e.g. "Emergency contacts" | browser history and history sync must not carry the owner's name |
| Query strings | never | a card URL must never carry parameters into logs |
| Access logs | slug and IP hashed; the full slug is never logged | Railway logs are a durable copy outside the DB |
| Favicon | inline data-URI | a 404 favicon is a wasted 3G round trip and a log line |
| `Vary` on `/c/*` | `Accept-Language, Cookie` | the page now varies by negotiated language and cookie; `no-store` already blocks shared caching, this states it |
| `<html lang>` | the resolved language (`en`/`es`/`fr`/`zh`/`ru`) | screen readers, correct CJK glyph selection, correct hyphenation |
| Language cookie | `Path=/c/{slug}`, session, `HttpOnly`, `Secure`, `SameSite=Lax`, cleared by Hide | a choice on one card must never touch another card or the owner plane |
| Fonts on `/c/*` | system stack only, **including the OS CJK font** | correct Russian and Chinese glyphs with zero webfont requests |
| Sponsor markup | none, asserted by test | D18 — the responder page carries no logo, no label, no pixel |

---

## 6. Rate limiting (industry standard)

Layered and OWASP-aligned: **throttle with exponential backoff, never a permanent
lock on unauthenticated input.** State lives in Postgres via
`rate-limiter-flexible` (atomic counters that survive redeploys and work with more
than one replica). Audit events live separately in `scan_attempts`.

| Layer | Rule | Purpose |
|---|---|---|
| 0 — enumeration | unknown slug runs a **dummy argon2 verify**; identical error text; response time padded to a floor | no existence oracle, by content *or* timing |
| 1 — per card | 4 free attempts, then backoff 5 s → 30 s → 2 min → 10 min → 1 h cap; counter decays after **7 days** without failures; success resets | stops online guessing at one card without bricking a safety feature. Yields ≈4–5 guesses per card per week (§3) |
| 2 — per IP | sliding window, 20 failures/hour across all slugs → 429 + `Retry-After: 3600` | stops spraying across many cards |
| 3 — per IP, volume | 60 PIN-page requests/min | stops scripted hammering of the form |
| 4 — owner auth | per-IP + per-account on login; signup and reset separately (3/hour per address, 10/hour per IP) | same standard, plus reset-flood protection |
| 5 — IPv6 | limit on the **/64 prefix**, IPv4 on the **full /32 address** | one host with 2⁶⁴ addresses would otherwise bypass per-IP limits; on IPv4 the full address is precise, and /24 would punish unrelated CGNAT users (D26) |

Details that matter:

- **IP storage:** `HMAC-SHA256(ip, IP_HASH_KEY)`, not a bare hash — IPv4 space is
  small enough to reverse a plain SHA-256 by brute force. Key the limiter on the
  full IPv4 address and the IPv6 /64; the durable audit row keeps only the prefix
  (D26).
- **Retention:** `scan_attempts` purges after 30 days from the Railway cron job
  (D24); limiter rows expire on their own TTL and the cron sweeps the orphans.
- **Audit kinds:** `pin_fail`, `pin_success`. Page loads are not audited — the
  limiter's job, not the log's (D25).
- **Trusted proxy:** Railway terminates TLS. Phase 0 verifies the app sees the real
  client IP and that `X-Forwarded-For` is trusted only from the platform hop.
- **Atomicity:** the increment and the decision are a single operation. No
  read-then-write. A 50-way concurrency test proves the ladder holds.
- **No permanent lock on unauthenticated input.** The spec's 24 h card lock is the
  one item that can be weaponised against the user by anyone holding the URL. The
  owner can always reissue a PIN from the dashboard.
- **Audit ≠ limiter state.** `scan_attempts(card_id, kind, ip_hash, created_at)`
  feeds the dashboard ("12 failed attempts in the last hour from 3 networks"),
  aggregated; it is not the counter the limiter reads.

---

## 7. Print and reprint

**Geometry.** ID-1 is 85.60 × 53.98 mm; the artwork is set **portrait on a normal
landscape card** (his choice), so it reads vertically when the card is held
upright and the card still fits wallet slots.

**Front layout (portrait artwork, 53.98 mm wide):**
- 3 mm safe margin → 47.98 mm usable width.
- QR ~32 mm, centred, top. Module 1.10 mm at version 3.
- PIN below, ~7 mm digits, generous tracking, maximum contrast.
- Owner first name as a header, so a responder knows whose card it is; omitted
  entirely when the owner gave none (D27).
- Three-step microcopy: "Scan · PIN · Call", read from the catalogue in the card's
  languages (D20).

**Back (optional side):** the card's instruction languages, read from the **same
catalogue as the responder page** (D20). EN/ES/FR/ZH/RU will not sit legibly on a
53.98 mm front strip — Chinese packs densely but Russian runs 30–40 % longer than
English — which is what the back side is for. The layout reserves five slots;
fewer languages fill the same block, in the card's own order.

**Not on the card:** the contacts and their spoken languages. The card carries the
QR, the PIN, the owner's first name and the instructions — the contact list is what
the QR is *for*, and printing it would hand it to whoever picks the card up.

**Fonts.**
- *Print:* Cyrillic (RU) and Simplified Chinese (ZH) need real coverage, and the
  owner's first name may carry Hungarian accents: **Noto Sans** for Latin-extended
  and Cyrillic, plus **Noto Sans SC** for Chinese. Both OFL-licensed,
  **subset-embedded per document** so each PDF stays a few hundred KB.
- *Web:* no font at all. The responder page uses the system stack, including the
  OS's own CJK font, which every iPhone, Android and Windows machine already has
  (D21). The print dependency never reaches the page.
- *Expansion:* Russian runs 30–40 % longer than English. The responder page is a
  fluid single column and absorbs that; the card back is fixed geometry, so its
  slots are sized on the longest language, not on English.

**QR sizing.** Keep the encoded URL short so the symbol stays in **alphanumeric
mode**: `https://<short-domain>/c/` + 26-char base32 slug ≈ 42 characters →
version 3 at ECC level M → 29 modules → 1.1 mm per module at 32 mm wide.
Comfortable for a phone camera at arm's length, which is the whole point.

**Deliverables, in the order he asked for them:**
1. **Preview** in the dashboard (rendered server-side, inline SVG) — always shown
   first, so a broken layout is caught before any download.
2. **Card-size PDF** — exact 53.98 × 85.60 mm page, `@page { size; margin: 0 }`,
   crop marks, no full bleed (the design is white on white, so bleed buys nothing
   and home printers cannot print borderless).
3. **A4 sheet** — 10-up, 5 × 2 on A4 landscape, shared cut lines, crop marks,
   A4/metric per his preference.
4. **Vector file for laser engraving** (later phase) — SVG/PDF with **text as
   paths** and the QR as crisp vector. Two safety notes: engraved metal has poor
   contrast, so the QR needs a darkened or filled marking; and **never laser-engrave
   PVC** — it releases chlorine gas.

**Reprint (D9, D16).** `/dashboard/card` shows the card and its PIN for as long as
`active` is true, with the same download options every time; a reprint reproduces
the same slug, PIN, layout and language set. The downloads disappear the moment
the card is deactivated or its slug regenerated, and the guest URL stops serving.

**Physical gate before any real card ships:** print at 100 %, scan with three
different phones at 10/20/30 cm in daylight and in low light, confirm PIN
legibility, photograph the result. Nothing else proves the product works.

---

## 8. GDPR, best effort

- One consent sentence beside the notes field plus "don't enter other people's
  data". He explicitly does not want Art. 9 machinery — no DPIA, no special-category
  fields. Residual risk accepted and recorded here.
- Privacy policy + ToS before public launch — the moment the landing page starts
  collecting an address: what is stored, why, for how long, subprocessors
  (Railway, Resend, Google), how to exercise rights. No cheque required.
- Rights in-dashboard: JSON export and permanent delete (hard delete, cascades
  including encrypted rows). Deleting the account kills every printed card — the
  URL stops serving, so say so on the delete screen, not only in the policy.
- Retention: `scan_attempts` 30 days, purged by the Railway cron job (D24).
  Everything else lives until the account is deleted.
- Cookies: strictly essential on all three counts — the better-auth session
  (owner), the view cookie (guest) and the `lang` cookie (guest) → no banner. All
  three are `HttpOnly`, `Secure`, `SameSite=Lax`. If Umami is ever added, it goes
  on the dashboard only, never `/c/*`, and never as a pixel.
- Sponsors (D18): a self-hosted SVG, a name, a link, a "Sponsored" label. No
  third-party request, no pixel, no analytics, no impression counting, **no data
  ever shared with a sponsor**, and nothing on `/c/*`. Outbound links carry
  `rel="sponsored noopener"`.
- One-paragraph breach procedure in `docs/SETUP.md`: how to revoke sessions, how to
  rotate keys, who to notify.
- Terms for the printed card: the card is a convenience, not a medical device and
  not a monitored service; a missed or ignored scan is not an alert. One sentence
  in the ToS, because a product that looks like a safety device needs the limit
  stated.
- No data selling is already a product promise; keep it literal.

---

## 9. Lightweight budget (measured, not aspirational)

| Target | Value |
|---|---|
| `/c/{slug}` and `/view` HTML | ≤ 12 KB uncompressed, ≤ 4 KB gzip |
| Requests to render the view | **1** — CSS, icon, everything inline; no webfonts, no images, no external anything |
| Server work on `/view` | ≤ 50 ms: one query, AES-GCM decrypt in µs, no KDF, no argon2 |
| DB round trips | 1 on GET (form), 1 on POST (verify), 1 on view (card + contacts joined) |
| JS on `/c/*` | **0 bytes**, asserted by test |
| Languages rendered | exactly **one** per response — the catalogue stays on the server, so five languages cost the same payload as one |
| Font requests | **0**, Chinese included — system stack only (D21) |
| `Vary` | `Accept-Language, Cookie`; negotiation is server-side and adds no round trip |
| Budget check | throttled-profile run in the suite; TTFB measured from Thailand, not from the Railway region |

The honest limit: on a 400 ms-RTT link, handshake plus request is already ~1 s
whatever the payload. Hence small payload **and** a single DB round trip **and** no
KDF on the hot path. Localisation is paid for on the server, not by the phone: one
rendered language, no font, no script. The only extra request a responder can
trigger is the language switch, and only by asking for it.

---

## 10. Schema

Kept from the spec: `cards`, `contacts` (reshaped), `card_notes`, `scan_attempts`.
Owner-auth tables come from better-auth (D8) with encrypted columns added, so no
hand-rolled `sessions` table.

```
users (better-auth, extended)
  id, email_hash UNIQUE, email_encrypted,
  name_encrypted NULL,           -- owner's first name; NULL = omitted (D27)
  password_hash NULL,            -- null for Google-only accounts
  email_verified_at, password_changed_at, created_at, updated_at
  (+ better-auth: session, account, verification)

cards
  id, user_id, slug UNIQUE,      -- 16 random bytes, Crockford base32
  pin_hash, pin_encrypted, pin_version, pin_rotated_at,
  languages text[],              -- ordered; [1] is the fallback; drives print AND
                                 -- the responder page; default {en,es,fr,zh,ru}
  active, scan_count,            -- scan_count = successful PIN unlocks (D25)
  last_failed_at,                -- display only; the limiter owns the real state
  last_viewed_at, created_at
  UNIQUE INDEX (user_id) WHERE active

contacts
  id, card_id, payload_encrypted, key_version, sort_order, created_at, updated_at
  -- payload schema 2: {name, relation, phone_e164, phone_display, spoken_languages}
  -- relation is a fixed code, not free text (D31)

card_notes
  card_id PK, notes_encrypted, key_version, updated_at

scan_attempts
  id, card_id NULL, kind,       -- pin_fail | pin_success only (D25)
  success, ip_prefix_hash,      -- HMAC of the IPv6 /64, or the full IPv4 (D26)
  created_at
  INDEX (card_id, created_at DESC), INDEX (ip_prefix_hash, created_at DESC)

rate_limits           -- owned by rate-limiter-flexible; created by migration
                      -- 0002, never by the library at runtime (ADR-016)
```

Dropped from the spec: `failed_count` / `locked_until` on `cards` (superseded by
the atomic, shared limiter store) and the `pgcrypto` columns. Dropped from this
plan: a `sponsors` table — the logos are static assets plus a checked-in config
with nothing to count (D18), so a sponsor change is not a migration.

---

## 11. Phases

Focused hours, solo.

### Phase 0 — Spikes (3–4 h)
1. Local Postgres 16 on **port 5433** (`noka-db`); 5432 belongs to `ghosted-db` — do not touch it.
2. Confirm better-auth's Astro example and the schema it owns; check whether ids can be uuid.
3. **The D11 question:** can better-auth drive email+password, Google and reset when
   `email` exists only as `email_hash` + `email_encrypted` (custom adapter or hook)?
   If not, D11 is dropped and the ADR says so. This is the only spike that can
   reshape the schema.
4. Verify Argon2 on `node:22-alpine` (`@node-rs/argon2`, musl prebuilds; fallback `bcryptjs`).
5. Verify on Railway: real client IP visible, **`Accept-Language` survives the
   proxy**, compression present, no extension needed.
6. `rate-limiter-flexible` with the Postgres store under 50 concurrent attempts, keyed
   on full IPv4 / IPv6 /64 (D26).
7. Confirm `pdf-lib` + fontkit subset embedding for Noto Sans (Latin+Cyrillic) and
   Noto Sans SC at card size, **and that two renders produce identical bytes** (D29):
   pinned metadata, no document `/ID`, stable object order.
8. Confirm system-font rendering of Russian and Chinese on iOS, Android and Windows
   with no webfont (D21) — screenshot all five languages on a real phone.
- Exit: D8–D30 confirmed or changed, recorded as ADRs in `docs/ARCHITECTURE.md`; a
  trivial SSR page live on Railway; the ADR list includes any decision this plan
  predicted wrongly.

### Phase 1 — Scaffold, pipeline, docs (3–4 h)
Astro SSR + `@astrojs/node`; Dockerfile and `railway.json` **reused from
`~/Code/kaja`** (pinned pnpm, advisory-lock `migrate-on-start`, healthcheck);
Drizzle + `postgres.js`; `/healthz`; security-header middleware; `robots.txt`;
vitest + Playwright skeleton; `src/i18n/` catalogue skeleton with the completeness
test; the §16 env inventory as a committed `.env.example`; LICENSE; README
(<200 lines) and the full `docs/` set — `INDEX`, `API`, `ARCHITECTURE`, `SETUP`,
`CHANGELOG`.
Exit: green deploy, migration applied by the container start command, `.env.example`
matches the code's actual reads, docs present and linked from `INDEX.md`.

### Phase 2 — Owner auth (5–6 h)
better-auth: email+password, Google OAuth (a Google Cloud OAuth client — 15 min of
console work, redirect URIs for localhost and prod), forgot password via Resend
**from a verified sending domain with SPF/DKIM/DMARC in place** (a reset mail that
lands in spam is a locked-out user), session revocation, `email_hash`/`email_encrypted`
columns, **email change** rewriting both columns in one transaction, first-name
capture at signup (D27), login rate limits, origin checks on POSTs.
Exit: e2e register → login → reset → logout plus Google sign-in on staging;
account-linking rule tested; a reset mail arrives at Gmail and Outlook, not just to
a log line.

### Phase 3 — Cards (4–5 h)
Slug (base32) and 6-digit PIN generation, `pin_hash` + `pin_encrypted`,
`pin_version`, ordered `languages` defaulting to the five with `[1]` as the fallback,
one-active-card constraint, onboarding creates exactly one card, view PIN, rotate
PIN, regenerate slug, deactivate/reactivate, and the D28 rule (no deleting the last
contact while active).
Exit: rotation invalidates cookies; the constraint holds under concurrent inserts;
the PIN is readable by the owner and never appears in logs.

### Phase 4 — Contacts, notes, encryption (5–6 h)
Encryption module with keyring and startup round-trip; the schema-2 JSON payload per
contact including **spoken languages** (validated against the catalogue vocabulary,
never free text) and the **fixed relation vocabulary** (D31); phone normalisation to
E.164 for `wa.me`; CRUD; `sort_order`; notes with the consent line; "at least one
contact before the card is active".
Exit: integration round-trip; a raw `SELECT` shows no plaintext; a wrong key fails
safely without echoing the key; decrypted values absent from logs; an invalid
language or relation code is rejected at write time.

### Phase 5 — Public PIN flow + localised responder pages (7–8 h) ← the product
Both GET paths, the POST verify with layers 0–3, the signed cookie, the view
render, owner first name, contacts, **spoken-language badges**, notes,
`tel:`/`wa.me` buttons, the "Hide" POST link, every header in §5, and the whole
responder surface in the card's languages: `Accept-Language` negotiation, the
`lang` cookie, the `POST /c/{slug}/lang` switch, `<html lang>`, and the localised
PIN page, error text and 429 page.
Exit: e2e journey; **0 JS bytes**; HTML under budget; axe clean on all five
languages; wrong-slug and wrong-PIN responses indistinguishable in content and
timing in every language; no missing catalogue key can ship; no sponsor markup
reachable.

### Phase 6 — Rate limiting and audit (4–5 h)
Layers 1, 2, 4, 5 through the limiter store; `scan_attempts` audit + dashboard
feed; the **Railway cron** purge job with a dry-run mode (D24); IPv4 /32 and IPv6
/64 keying; `Retry-After`.
Exit: fake-clock tests over every transition; 50-concurrent-attempt test; the
capped-backoff behaviour asserted (no permanent lock); the purge deletes exactly the
rows past 30 days and nothing else.

### Phase 7 — Print, preview and reprint (5–6 h)
**D30 first:** the card's visual identity is agreed as an image before any pipeline
code. Then: server-rendered preview, card-size PDF, A4 10-up landscape PDF,
subset-embedded Noto fonts, print instructions read from the **same catalogue** as
the responder page, deterministic reprint (D29), the no-PIN variant behind a blunt
warning, and the physical print/scan test with three phones.
Exit: PDFs measure exactly 53.98 × 85.60 mm; the A4 sheet has 10 correct positions;
two renders of the same card are byte-identical; every printed language matches the
card's own set; QR scans at 10–30 cm.

### Phase 8 — Sponsor logos (1–2 h)
Static self-hosted SVGs on the landing page and the auth pages, a checked-in config,
a "Sponsored" label, fixed width/height so nothing shifts, `rel="sponsored noopener"`,
no third-party request and no counting (D18). No dashboard slot, no email line, no
pricing and no payment path — monetization is deferred, not half-built.
Exit: an automated test asserts no sponsor content on any `/c/*` or `/dashboard`
response, and that every logo is same-origin.

### Phase 9 — Hardening and launch (4–6 h)
Threat model doc, header review, error paths, pino redaction, **one error-tracking
choice** (vendor or "logs only" — decide, do not leave it implicit), staging env,
privacy/ToS pages including the printed-card terms in §8, export + delete, backup
**and restore drill** (restore the DB, decrypt, prove the key matches), smoke load
test, runbook.
Exit: restore drill decrypts real data; staging green; policies live; the ADR set is
complete enough that `docs/ARCHITECTURE.md` explains every choice this file makes.

### Later (planned, not v1)
Owner-selectable print languages at card generation (D15 — the column is already
there); laser-engraving vector export; additional card designs; the re-encryption
pass for a rotated contact key (D23); a Thai card variant (§14.5); **sponsor
outreach, pricing, payments and any measurement** — deferred wholesale with the rest
of monetization.

**Total ≈ 40–52 focused hours.** Demoable end-to-end card at the end of Phase 5,
roughly 26–32 h in.

---

## 12. Verification

- **Unit:** slug/PIN generation, keyring encrypt/decrypt and tamper detection, cookie sign/verify/tamper, backoff state machine on a fake clock, phone normalisation, language-set rendering, spoken-language and relation-code validation, `Accept-Language` negotiation matrix (match, partial match, `q`-weights, no match, malformed header), language-cookie scoping per card, IP key derivation (IPv4 /32, IPv6 /64).
- **Catalogue:** a test walks every key × every language and fails on a missing or empty string, on a key present in one language only, and on a placeholder mismatch between languages. That includes all seven `relation` labels and every spoken-language name. A language added to `cards.languages` without catalogue entries fails the build, not the responder.
- **Integration:** real Postgres on 5433, migrations from empty, cascade deletes, one-card constraint, blind-index email lookup, email change rewriting both columns atomically, 50 concurrent attempts, purge job dry-run and 30-day boundary.
- **E2E (Playwright, headless is fine):** register → card → contacts → preview → download → guest PIN flow → wrong PIN → backoff → rotation kills a live cookie; a Plane B cookie fails on `/c/*` and vice versa; the language switch survives a redirect and does not leak into a second card; the responder page renders in each of the five languages with `<html lang>` correct.
- **Budget assertion in the suite:** `/c/*` responses contain zero `<script>`, zero external URLs and zero `@font-face`, and stay under the size cap — asserted for all five languages, not just English.
- **Accessibility:** axe on the PIN page and the view in all five languages; contrast ≥ 7:1; tap targets ≥ 48 px; body text ≥ 18 px.
- **Print:** two renders of one card are byte-identical; PDF page boxes match ID-1; the A4 sheet measures 10 positions; the printed language set equals `cards.languages`.
- **Sponsors:** no sponsor markup in any `/c/*` or `/dashboard` response; every logo asset is same-origin.
- **Manual once:** the physical print/scan test, the five-language phone screenshot pass, and the restore drill.

---

## 13. Out of scope for v1

Mobile app; structured medical fields; analytics on the public page; social login
beyond Google; multiple cards per account; public profiles or discovery; ad
networks, tracking pixels or **any monetization machinery** (pricing, payments,
invoices, impression counting — sponsor logos are static, D18); per-user encryption
keys or KMS envelope encryption; **dashboard and landing localisation** (the
responder pages and the printed card *are* localised, D19); the language picker UI;
laser-engraving export; the contact-key re-encryption pass.

---

## 14. Open notes

1. **Print and responder languages are one ordered set — EN / ES / FR / ZH / RU**,
   with `[1]` as the fallback. The layout reserves five slots; the picker lands
   later without a redesign (D15, D19).
2. **`PUBLIC_CARD_ORIGIN`** must be fixed before the first card is printed — keep
   the domain short, since every URL character is QR density. It is also baked into
   every printed QR, so changing it later invalidates physical cards; say that on
   the card screen, not in a footnote.
3. **Google Cloud OAuth client** is the only dependency needing his hands, and it is
   no longer alone: a Resend sending domain plus its DNS records (SPF, DKIM, DMARC)
   is the second, and without it the reset mail lands in spam.
4. **Glyph coverage:** the five languages need two print faces — Noto Sans
   (Latin-extended for the owner's Hungarian name, Cyrillic for Russian) and Noto
   Sans SC. The web needs no font at all. A language outside the five (Thai,
   Arabic) adds a third subset *and* a catalogue's worth of strings; the
   spoken-language vocabulary is separate and carries no such cost.
5. **Region check:** RU instead of TH means the card carries no Thai, which is worth
   a deliberate thought given where he lives. Languages are per card (D15), so a
   Thai variant can coexist the moment the picker exists.
6. **Naming is settled: the product is `noka`** — *next of kin access*. Written
   lowercase, package and repo `noka`, matching the workspace directory. The earlier
   working title **Nokard is archived** and must not reappear in code, copy, the
   package name or the eventual domain.
7. **Spoken-language vocabulary:** a curated code list whose labels exist in all
   five UI languages. Every code added costs five strings, so the list stays
   bounded and the UI offers "Other" for anything outside it. Starting set:
   `en, hu, th, zh, ru, es, fr, de, it, pt, ar, ja` — changed in one place, the
   catalogue.

---

## 15. Endpoint contract

Public plane — no account, no JS, no third-party requests on `/c/*`.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/` | landing: what the card is, entry to signup/login, **static sponsor logos** (D18). English only |
| GET | `/c/{slug}` | 200 **localised** PIN form, no contact data in the HTML. Unknown, revoked and deactivated slugs return the identical form |
| POST | `/c/{slug}` | body `pin`. 303 → `/c/{slug}/view` on success; 200 form + generic error on failure; 429 + `Retry-After` when backed off or IP-blocked. Errors in the responder's language |
| GET | `/c/{slug}/view` | 200 emergency view with a valid cookie; otherwise 303 → `/c/{slug}` (never an error page) |
| POST | `/c/{slug}/hide` | clears the view **and** language cookies, 303 → `/c/{slug}` — zero JS "hide now" |
| POST | `/c/{slug}/lang` | body `lang`, one of `cards.languages`. Sets the language cookie, 303 back to the current step (view when unlocked, form otherwise). Unsupported code → 400; never a query string (§5) |
| GET | `/privacy`, `/terms` | policy pages, English only |
| GET | `/robots.txt` | `Disallow: /c/` |
| GET | `/healthz` | Railway healthcheck |

Owner plane — better-auth session, SSR forms, origin-checked POSTs, English only.

| Method | Path | Behaviour |
|---|---|---|
| GET/POST | `/signup`, `/login`, `/forgot`, `/reset` | account lifecycle; first name captured here (D27); reset tokens single-use and short-lived |
| ANY | `/api/auth/*` | better-auth (Google callback, session) |
| POST | `/logout` | server-side session revocation |
| GET | `/dashboard` | card summary, PIN, scan activity. **No sponsor slot** (D18) |
| GET/POST | `/dashboard/profile` | first name and **email change** — `email_hash` and `email_encrypted` rewritten in one transaction |
| GET/POST | `/dashboard/card` | onboarding: exactly one card, requires ≥1 contact to activate; shows the origin warning of §14.2 |
| POST | `/dashboard/card/rotate-pin` | new PIN, bumps `pin_version`, kills live view cookies |
| POST | `/dashboard/card/regenerate-slug` | new QR; the old printed card stops working permanently |
| POST | `/dashboard/card/deactivate` \| `/activate` | gates the guest URL **and** the print/download endpoints |
| GET/POST | `/dashboard/contacts[/new\|/{id}/edit]`, `POST .../delete` | encrypted CRUD; decrypt → form → re-encrypt; relation from the fixed vocabulary (D31) and spoken languages from the catalogue; the last contact cannot be deleted while active (D28) |
| GET/POST | `/dashboard/notes` | free-text, consent line |
| GET | `/dashboard/card/preview` | server-rendered responder view for the owner (owner session, distinct path), with a language picker for previewing each printed variant |
| GET | `/dashboard/card/print/{card\|a4}.pdf` | deterministic download (D29); disappears when inactive |
| GET | `/dashboard/card/print.svg` | engraving vector, text as paths (later phase) |
| GET | `/dashboard/activity` | aggregated scan/failure log from `scan_attempts` |
| GET | `/dashboard/export` | JSON export of the account's data |
| POST | `/dashboard/delete-account` | hard delete, cascades including encrypted rows; warns that printed cards die with it |

No HTTP surface for the purge: it is the cron script of D24.

---

## 16. Environment and configuration

Every secret is separate per purpose (D22) and lives only in Railway variables and
his password manager — never in the repo, a log, an error message or the DB. A
single `src/config.ts` is the only module that reads `process.env`; a lint rule and
a test enforce that, so the inventory below cannot drift from the code.

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres | Railway-provided in deploy; local 5433 in dev |
| `PUBLIC_CARD_ORIGIN` | origin baked into QR and printed instructions | short; changing it invalidates printed cards (§14.2) |
| `VIEW_COOKIE_SECRET` | signs the guest cookie `{slug, pin_version, exp}` | ≥32 random bytes; **not** the owner's secret |
| `BETTER_AUTH_SECRET` | better-auth session signing | owner plane, separate by design |
| `BETTER_AUTH_URL` | callback base URL | localhost vs production |
| `CONTACT_ENCRYPTION_KEY` | AES-256-GCM keyring entry 1, base64 | password manager; loss = data loss |
| `EMAIL_LOOKUP_KEY` | HMAC key for `email_hash` | not rotatable in v1 (D23) |
| `IP_HASH_KEY` | HMAC key for IP and prefix hashing | not rotatable in v1 (D23) |
| `RESEND_API_KEY` | transactional email | reset, verification, security notice |
| `EMAIL_FROM` | verified sender address | must match the DKIM-verified domain |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | scopes limited to `openid email profile` |
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | runtime | Railway supplies `PORT`; pino redaction is fixed, not configurable per env |
| `RAILWAY_GIT_COMMIT_SHA` | build identity | surfaced on `/healthz` so a smoke test proves which build answered |

`.env.example` is committed with the names and empty values. Startup fails fast on
any missing key and round-trips one encrypt/decrypt against the DB before serving
(§4) — a deploy with a wrong key must never accept a write.

---

## 17. Accepted weaknesses and known limits

Written down so nobody discovers them as surprises:

1. **One factor plus a secret.** The slug and the PIN are printed on the same object,
   so a photographed card needs only the PIN (§3). The limiter is what makes that
   expensive, not a second factor.
2. **Hold the card, know the PIN, read the contacts.** That is the product, not a
   defect.
3. **Phone numbers are unverified.** A typo is discovered in an emergency, by
   someone else. The card screen prompts a test call; no verification is in scope.
4. **`EMAIL_LOOKUP_KEY` and `IP_HASH_KEY` are not rotatable in v1** (D23).
5. **Printed cards are unchangeable.** They follow the slug, and they die with the
   account or with a slug regeneration, without notice to whoever holds the card.
6. **A scan is not an alert.** Nothing notifies the owner in real time; the activity
   log is the only signal.
7. **A distributed guesser still meets the per-card counter**, which is deliberate:
   the card throttles to ≈4–5 guesses per week, which also means a determined
   attacker can make a legitimate responder wait.
8. **The responder language set is the owner's choice.** A card printed only in
   EN/ES is unreadable to a Thai-only responder; the localised page helps only
   within the card's own set.
9. **IP limits can be wrong behind CGNAT**, and the dashboard reports network
   counts, never geolocation (D26).

---

## 18. Monetization and closure policy (D32)

The product is not the business. It exists to be used, and the money question is
answered by two rules that do not touch the user.

**Users are never charged. Not a free tier, not a trial, not a "pro" tier later.**
An emergency card that stops working when a subscription lapses is worse than the
post-it it replaces.

**Revenue, if any, comes from the sides:**

- **Project sponsors** — static, self-hosted logos on the landing and auth pages.
  Never on `/c/*`, never a pixel, never a script, never an impression counter.
  (D18 already fixes this; §8 lists what a sponsor must not get.)
- **Whitelabel** — a partner running an instance under their own brand, paying
  for the work rather than for permission. MIT already grants the permission, so
  what is sold is hosting, customisation and support, not a licence.
- **Nothing else.** No user data sold, shared or brokered, ever. No analytics on
  the responder page. No "anonymised insights" — that phrase is a data sale with
  a friendlier name.

**Two commitments about the project itself:**

- **No acquisition that closes it.** If someone offers to buy the product and run
  it as proprietary software, the answer is no. An emergency card is
  infrastructure for whoever is holding it, and infrastructure that can be
  withdrawn does not deserve the trust.
- **The canonical repository stays MIT** (ADR-018) and stays open. Anyone may
  fork it; nobody may take this one away.

**What that costs, stated plainly:** MIT means someone else may legally fork noka,
close their fork and sell it. The commitment above binds the owner, not the
licence. That is a known, accepted trade — the alternative was a licence that
would have made the code harder to reuse for the people this is for.

**What is still undecided, and is fine to be:** whether sponsors ever actually
appear, what a whitelabel deal would cost, and whether any of this is worth
doing before ten people have printed a card. None of it blocks the build.

## Tomorrow — the action plan from two independent reviews (2026-09-29 evening)

Claude Sonnet 5 and GPT-5.6 Sol read the pushed repository separately. Their verdicts agree on the
shape: the architecture is sound and the responder plane's constraints hold, but the **write paths
are not transactional**, and a few documents claim more than the code does. Everything below was
checked against the code before it was written down; two of the findings were claims I had made
myself earlier the same day.

### 1. Concurrency and transactions (the real defect class)

Every one of these is a read-then-write with no transaction, and every one has a two-tab or
double-click path to a bad state. This is tomorrow's first job, in this order.

| # | File | Failure | Fix |
|---|---|---|---|
| 1 | `src/lib/contacts.ts:173-180` | Two deletions of the last two contacts each see `length > 1`, both delete, neither deletes the card → a live card pointing at nothing | one transaction: delete, recount inside it, then delete the card |
| 2 | `src/lib/cards.ts:41-64` | Two "Make my card" requests both pass the existence check; one hits the unique index and returns a 500 after two Argon2 hashes | `insert … on conflict do nothing` + return the winning row |
| 3 | `src/lib/contacts.ts:125-140` | `sortOrder` comes from `listContacts().length` → colliding order under concurrency, and it decrypts every existing contact before every insert | `max(sort_order) + 1` in the same statement |
| 4 | `src/lib/responder.ts:93-114` | The audit insert and the `scanCount` update are separate writes: an interruption logs a success but leaves the counter behind, or a valid PIN 500s | one transaction, and decide whether audit is allowed to block emergency access (it should not) |
| 5 | `src/lib/account.ts:49-108` | The export is assembled from independent queries: rotating a card or editing a contact mid-export yields a file describing a state that never existed | one repeatable-read transaction |

### 2. Server-side limits and layout robustness

- **No service-layer length limits** (`src/lib/contacts.ts:91,190-207`): `maxlength` exists only in
  HTML, so a direct POST stores arbitrarily large encrypted values. Enforce in the service.
- **No overflow handling on the responder page** (`src/layouts/Responder.astro:101-105`): a long
  unbroken name or note overflows the card. `overflow-wrap: anywhere`.
- **No cap on contacts** (`src/lib/responder.ts:123-136`): 200 contacts are decrypted and rendered
  into one emergency response, against the stated 12 KB budget. Cap it server-side at a number that
  makes sense for an emergency (10–20), and say so in the UI.

### 3. Product questions the reviews raised, which are mine to answer, not to code around

- **A deleted or superseded card is indistinguishable from a wrong PIN, forever.** That is the
  anti-enumeration design working as intended, and it is also a person standing in the street. The
  card itself may need a printed line ("no answer? call this number") so the artefact is useful when
  the software is not. Related: `no-store` and no service worker mean the page cannot work offline,
  so the landing copy "works on a bad mobile connection" should say what it actually needs.
- **Every printed card hard-binds one origin** (`src/lib/cards.ts:112-115`). Losing the domain bricks
  every card in every wallet. Own a durable redirect domain, and write the migration story down
  before printing anything.

### 4. i18n follow-ups (found by review, all real)

- **Pluralisation**: `src/pages/dashboard/index.astro:120` hand-picks one/many, which cannot express
  Russian's three plural categories. Use `Intl.PluralRules` for the keys that take a count.
- **RTL**: `dir` now exists in `LANGUAGE_INFO` and both layouts render it, but no layout has been
  looked at mirrored. Arabic is a metadata change plus a visual pass — the doc now says so.
- **Card artwork vs longer translations** (`src/lib/card-artwork.ts:87-121`): fixed pixels, no
  measurement. A longer language overlaps its slot instead of failing. Measure and fail loudly.

### 5. Tests to add with the fixes above

Concurrent last-contact deletion · concurrent card creation · fault injection between audit insert
and counter update · export during rotation/edit · 200-contact create and response budget · direct
POST over the name/note limits plus an unbroken-name layout case · upgrade migration with pre-existing
contacts and notes (current DB tests mostly start from a fresh schema) · an exact live-vs-unknown
response comparison, because the README claims byte-identical and the test only checks a few strings.

### 6. Cut or correct

- **`scan_count` / `last_viewed_at` are written twice** (`src/db/schema.ts:35-39`, `responder.ts:93-114`)
  for convenience and create a consistency failure for no emergency benefit. Derive activity from
  `scan_attempts` instead, or accept it and stop maintaining two counters.
- **The dashboard runs `countContacts()` after `listContacts()`** (`src/pages/dashboard/index.astro:31-34`)
  — an extra query and a count that can disagree with the list beside it. Use `contacts.length`.
- **The documentation needs a stale-claims pass.** The README quotes fixed test counts and still lists
  export/deletion as pending (they shipped today); `docs/PLAN.md` reads as pre-code in places and
  describes endpoints that no longer exist. Historical spec is fine, but it must be marked as history.
