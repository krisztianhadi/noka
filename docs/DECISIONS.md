# Decisions

Every decision this project made, in the order it made them: what the situation
was, what was chosen, and what it cost. Written as ADRs because the reasoning is
the artifact — the code only shows the result. [PLAN.md](PLAN.md) is the build
contract; this file explains the calls inside it, including the ones that were
later reversed.

| # | Decision | Status |
|---|---|---|
| 001 | Postgres 16 on port 5433, dev server on port 3200 | locked |
| 002 | Astro 7 with `@astrojs/node`, no client framework | locked |
| 003 | App-side AES-256-GCM with a keyring, not pgcrypto | locked — overrides the original brief |
| 004 | **D11 dropped**: the owner's email is stored in plaintext | locked — reverses PLAN §2/D11 |
| 005 | `relation` is a closed vocabulary, never free text | locked |
| 006 | One message catalogue drives the responder page and the printed card | locked |
| 007 | The guest cookie is hand-signed; Astro's session store is unused | locked |
| 008 | `cards.user_id` is a real foreign key | locked |
| 009 | Argon2id for owner passwords, not better-auth's default scrypt | locked |
| 010 | The owner plane is plain server-rendered forms | locked |
| 011 | The PIN is stored twice; an empty card cannot be active | locked |
| 012 | The dashboard guard lives in middleware | locked |
| 013 | Contacts are vocabulary codes; phone numbers are not guessed at | locked |
| 014 | Our own origin checks, not Astro's global one | locked |
| 015 | The responder plane is one request, one language, no oracle | locked |
| 016 | The rate limiter's store, and what its counter counts | locked |
| 017 | The printed card can be byte-deterministic | locked |
| 018 | MIT — the licence, with the reasoning written down | locked |
| 019 | Users are never charged; sponsors or whitelabel; never sold into closed source | locked |

## Open decisions

These are deliberately not decided yet; each blocks a specific phase.

- **`PUBLIC_CARD_ORIGIN`** — the production origin, which is baked into every
  printed QR. Short domain, decided before the first card is printed (PLAN §14.2).
- **Card visual identity** (D30) — one design, agreed as an image before the
  print pipeline is written.
- **The rate-limit ladder's exact numbers** (PLAN §6) — the shape is decided
  (exponential backoff, no permanent lock); the constants are Phase 6.
- **Where the devlog gets published** — the drafts follow the txt.krisztian.wtf
  post format; the destination is chosen when there is a post worth shipping.

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

### ADR-011 — the PIN is stored twice, and a card cannot be active while empty

`cards.pin_hash` verifies; `cards.pin_encrypted` lets the owner read and reprint
their own card for as long as it is active (D9). Losing the encryption key
therefore costs the ability to *reprint*, not the ability to *verify* — worth
knowing before anyone "simplifies" the second column away.

Activation is gated on `contactCount(cardId) > 0` (D28, §15): an active card
that leads to an empty page is worse than an inactive one, and the dashboard
button is disabled with the reason shown. Deactivation is always allowed.
`pin_version` is bumped by rotation, which is what invalidates live view cookies
— the hash swap is what makes the old PIN useless. Two different jobs.

### ADR-012 — the dashboard guard lives in middleware

`src/middleware.ts` resolves the better-auth session for any `/dashboard/*`
request and either redirects to `/login` or puts `{id, name, email}` on
`Astro.locals.owner` (typed in `src/env.d.ts`). Pages therefore never
re-derive the session, and a new dashboard route cannot forget the guard. The
lookup happens only for `/dashboard/*`, so the responder plane pays nothing for
it.

Note for local e2e runs: Playwright reuses a server already listening on :3200
(`reuseExistingServer`). If that server is running an older build, the suite
tests the old code — restart it before `pnpm test:e2e`, or stop it and let
Playwright build and start its own.

### ADR-013 — contacts are vocabulary codes inside the encrypted blob, and phones are not guessed at

A contact is one encrypted JSON payload (schema 2) holding `name`, `relation`,
`phone_e164`, `phone_display` and `spoken_languages`. Relation and spoken
languages are **codes**, validated on write against closed vocabularies, so the
responder page can translate them (D19, D31) and an invalid code cannot reach a
rendering.

The spoken-language vocabulary is deliberately wider than the card's five print
languages — it answers "who can I talk to", not "what is this printed in" — and
every code needs a label in all five UI languages, which is what keeps the list
curated (`other` covers the rest).

**Phone numbers are not guessed at.** `normalizePhone` strips separators,
requires a leading `+`, validates the length and refuses a country code starting
with zero — and returns `missing-country-code` rather than inventing a country
for a national number. That means a Hungarian typing `06 1 234 5678` gets a
clear refusal instead of a saved number that dials the wrong country. Swapping
in libphonenumber later changes only this module; the payload format stays.

Two more rules live in the service rather than in the pages, so they cannot be
bypassed by a new route: every contact query is scoped by `card_id` (a test
asserts one account cannot read or delete another's contact), and the last
contact on an active card cannot be deleted (D28).

### ADR-014 — our own origin checks, not Astro's global one

Astro's `security.checkOrigin` defaults to on and rejects a POST whose `Origin`
does not match the host. That is fine for the owner plane and wrong for the
responder plane: the emergency PIN form must not depend on a header that some
webviews and privacy tools omit, and a 403 on a scanned card is a product
failure. It is therefore off, and every owner-plane POST calls `isSameOrigin`
(`src/lib/http.ts`) itself — signup, login, logout, card actions, contacts,
notes. The guest plane never changes another party's state, so it needs no
origin check at all.

Related: `readForm()` replaces `request.formData()` everywhere. A POST with no
body or an unknown content type makes `formData()` throw a `TypeError`, which
turned a bodyless POST into a 500 on the PIN page. The responder plane now
answers with its ordinary page.

### ADR-015 — the responder plane is one request, one language, no oracle

- **One request per page.** `build.inlineStylesheets: 'always'` keeps the CSS in
  the HTML. This is not only a 3G optimisation: the responder CSP is
  `style-src 'unsafe-inline'` with `default-src 'none'`, so an extracted
  stylesheet would be blocked by our own header.
- **The cookie is checked twice.** The HMAC proves we issued it; the database
  check proves the card is still active and the `pin_version` still matches. A
  rotated PIN or a deactivated card therefore takes effect on the next request,
  not at cookie expiry.
- **Nothing is an existence oracle.** An unknown slug renders the same page —
  including the language switcher, which is why the default language set is used
  when there is no card. Timings are padded to a 350 ms floor and an unknown slug
  burns a decoy Argon2 verification. The only difference between the real card's
  page and a made-up one is the slug echoed in its own form action, which the
  responder supplied in the first place.
- **The PIN is accepted as printed.** It is printed grouped (`123 456`), so
  `normalizePinInput` strips any spacing before verification. Six digits are
  still required; no entropy is lost.
- **Language precedence:** the `lang` cookie, then `Accept-Language` ∩ the card's
  set, then the card's first language. A stale cookie falls through rather than
  erroring.

### ADR-016 — the rate limiter's store, and what its counter actually counts

`rate-limiter-flexible` 11.2.1 with its Postgres store (D12). Three things were
decided by the Phase 0 spike:

- **One database driver.** The store wants `query({text, values}) -> {rows}`; the
  app already has postgres.js. A five-line adapter (`src/lib/limiter.ts`) is
  cheaper than a second driver and a second connection pool. `pg` was installed
  for the spike and removed again. `storeType: 'pool'` is required because the
  store infers the client kind from the constructor name and a plain object has
  none.
- **The table comes from a migration** (`drizzle/0002_rate_limits.sql`), not from
  the library at runtime. The store creates it asynchronously in its constructor
  and rejects every `consume()` with "Table is not created yet" until that
  resolves — a race the first responder would lose. After construction
  `limiter.tableCreated = true` stops the redundant DDL.
- **Verified atomicity:** 50 concurrent attempts on one key allow exactly
  `points` and refuse the rest — no lost updates. Two instances share one
  counter, as two replicas must.

And one property worth writing down, because it is easy to misread:

- **The counter counts attempts, not allowances.** Every `consume()` increments
  it inside the same atomic upsert that decides the outcome, so after 50 attempts
  against `points: 10` the stored value is 50. For a throttle that is the right
  behaviour. It also means the counter is *not* a tally of successful unlocks —
  that is `cards.scan_count` (D25) — and a dashboard must not present it as one.
- **The window is fixed from the first attempt** and later attempts never extend
  it, so hammering cannot push the owner's own retry further away. The refusals
  carry `msBeforeNext`, which is what the `Retry-After` header will use.

### ADR-017 — the printed card can be byte-deterministic (D16, D29)

Phase 0 spike, run by `scripts/spike-pdf.mjs`, with the hermetic half kept as
`tests/unit/pdf-determinism.test.ts`:

- **Two renders of the same page are byte-identical** — with standard fonts and
  with an embedded subset font. pdf-lib 1.17.1 writes no random `/ID` and no
  timestamped `CreationDate`/`ModDate` unless asked; with the dates pinned it
  stays deterministic.
- **Subsetting is not optional:** the same page is 5.6 KB with a subset font and
  419 KB without. §7's few-hundred-KB estimate is what no subsetting looks like.
- **A variable Noto Sans subsets fine and stays deterministic**, so the
  Latin+Cyrillic face may be a variable font.
- **A `.ttc` collection fails** — `createSubset is not a function`. Phase 7 must
  therefore vendor a **single-face** Noto Sans SC (and its Latin/Cyrillic
  partner) into the repository instead of reading whatever the host has.
- Determinism is per *(pdf-lib version, font file bytes)*. That is exactly why
  D16 promises a reprint "byte-comparable **for the same card revision**", and
  why the Phase 7 test must pin the library version and use the vendored fonts.
- pdf-lib stamps its own `/Producer` at save time and ignores `setProducer`. It
  is a constant, so it threatens nothing — but the printed PDF will advertise
  pdf-lib.

### ADR-018 — MIT

An emergency card that only works on my server is a worse product than one that
can be run anywhere, and the whole idea is small enough that someone else hosting
it costs me nothing. MIT is the licence that asks the least of the person who
wants to fork it, print their own cards and never talk to me: a friend with a
printer, a clinic, a small NGO.

What it gives up, knowingly: anyone may host a modified noka commercially without
contributing back. For a product whose entire value is a wallet-sized piece of
paper, network-effect protection is not worth the friction — and AGPL would have
made the code harder to reuse for exactly the people this is for.

The alternatives were considered and rejected in one line each: **AGPL** for the
same reason above; **no licence at all**, which is the worst option because it
means nobody may legally use it; **a source-available licence**, which reads as a
trap to a reviewer and buys nothing here.

Consistency mattered too: Ghosted, the sibling project, is MIT, so a reader
moving between the two repositories does not have to think about licensing.
### ADR-019 — users are never charged, and the project is never sold into closed source

A monetization decision, written down before there is any money, because the
order matters: a policy invented after the first offer is a rationalisation.

**What goes to the user:** nothing, ever. Not a free tier with a paid upgrade,
not a trial, not a "pro" plan. An emergency card that stops working when a
subscription lapses is worse than the post-it it replaces, and a product whose
value shows up in the worst ten minutes of someone's week should not have a
payment form in front of it.

**What pays for it:** project sponsors (static, self-hosted logos on the landing
and auth pages, D18) and whitelabel arrangements (a partner running an instance
under their own brand and paying for hosting, customisation and support — MIT
already grants the permission, so permission is not what is sold). Nothing else.

**What is never sold:** user data — not raw, not aggregated, not "anonymised
insights". That phrase is a data sale with a friendlier name, and it is the one
kind of revenue that would make the encryption boundary pointless: the contact
data is unreadable by design, and the email and metadata around it are not for
sale either.

**What is refused outright:** an acquisition that closes the product. An emergency
card is infrastructure for whoever is holding it. Infrastructure that can be
withdrawn does not deserve the trust people place in it by printing it.

**The honest cost of that last promise:** MIT (ADR-018) lets anyone fork noka,
close their fork and sell it. This ADR binds the owner, not the licence. Making
it legally binding would mean a different licence and a contributor agreement —
more friction for exactly the people the project exists for. Accepted knowingly,
and written here so nobody later discovers it as a loophole.

**Why now and not later:** the licence (ADR-018) was the moment a reader could
start asking what the business model is. "We will figure it out" is how projects
end up with an analytics pixel on an emergency page.
