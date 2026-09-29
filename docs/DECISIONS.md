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

### ADR-020 — A card is live or it does not exist (supersedes parts of D9, D28)

**Context.** He tested the first build and reported: the PIN "doesn't work" (it did — the
card was switched off), and "new PIN" and "new QR" were two buttons for one intention.

**Decision.** Delete activation and deactivation, and merge the two rotations. A card is
set `active` at creation and stays that way; the owner has exactly two actions:

- **Make my card** — refused unless at least one contact exists, live immediately.
- **New card** — new slug and new PIN together; the printed card dies at once.

**Why.** The switch was a state a personal emergency card never needed, and it produced the
worst possible failure mode: a card that looks fine and does nothing. Merging the rotations
matches the mental model — the object being replaced is the *card*, not its parts.

**Consequences.** `cards.active` and the partial unique index survive (a revoked card is
still expressible), but nothing in the UI sets it false. Deleting the last contact while a
card exists is refused, since a card with nobody behind it is worse than no card; the way
out is to edit the contact or add another. `pin_version` still bumps so live view cookies
die with the old card.

### ADR-021 — Reachability channels, not a phone number

**Context.** "WhatsApp should be an option… WhatsApp, Signal, Telegram, Viber, phone call
(on by default), SMS/text (covers the case if the user is mute or lives with disability)."

**Decision.** Each contact carries a set of channels — `call`, `sms`, `whatsapp`, `signal`,
`telegram`, `viber` — stored as codes in the encrypted payload (schema 3), defaulting to
`call` when nothing is selected. The responder page renders a **button** for call, WhatsApp
and SMS, and a labelled "Available on …" line for Signal, Telegram and Viber.

**Why.** A number is not the same as a way to reach a person. Text matters most: it is what
works when the responder cannot speak, cannot hear, or cannot use a phone at all. Buttons
are reserved for the schemes that are recognised and reliable; the rest stay readable as
text even when their deep link does nothing, which is the honest failure mode.

**Consequences.** `whatsappHref`/`telHref` moved out of the contact payload into
`src/lib/channels.ts`; the payload schema is 3 and still reads 2, upgrading it in memory
with `call`. Channel labels join the five-language catalogue, so the responder page stays
translatable (D31).

### ADR-022 — Contacts and notes belong to the owner, not to the card

**Context.** "Add contact pointed to the create a card — I think it should be the other way
around: first I add contacts then I create a card."

**Decision.** `contacts.user_id` replaces `contacts.card_id`, and `card_notes` becomes
`owner_notes` keyed by `user_id`. A card is only the thing a QR points at; the responder
page reads the people and the notes through the card's owner.

**Why.** The old model made the card a parent of the people, so onboarding had to start with
the card, and reissuing a card either orphaned or duplicated the contacts. The new model has
one owner of the data and one access token to it: reissuing a card touches nothing that
matters, deleting a card touches nothing that matters.

**Consequences.** Two migrations, written to **copy before dropping** — the auto-generated
version dropped the card link first, which would have destroyed the attribution of every
existing contact. The dev database was rebuilt from empty to verify the fresh-install path.
The delete guard (ADR-020) is now expressed as "last contact while a card exists".

### ADR-023 — Account settings are immediate, because there is no mailer yet

**Context.** He asked for settings (password, email) behind the header menu. better-auth's
`changeEmail` refuses outright without a working verification-email flow — "Verification
email isn't enabled" — and Resend is not configured yet.

**Decision.** The email is updated directly on the `users` row, immediately, with the unique
index as the only gate, and the change is reported as `email-taken` if it collides. The
password changes through `changePassword` with `revokeOtherSessions`, which in practice ends
**every** session including the current one; the owner is sent to `/login` with a notice
saying exactly that.

**Why.** A settings page that silently does nothing is worse than one that acts without a
confirmation link, and the account is protected by a password the owner already holds. The
trade-off is recorded rather than hidden: an email change confirms nothing, so a mistyped
address can lock the account out of its own recovery. When the Resend domain exists this
becomes a verification flow, and this ADR is superseded.

### ADR-024 — Dark mode is a cookie, not a client-side theme

**Decision.** The choice lives in a cookie, is read in middleware, and arrives as
`<html data-theme>`. No cookie means "follow the system", via
`@media (prefers-color-scheme: dark)`. Colours are CSS custom properties on `:root`.

**Why.** A server-rendered theme has no flash of the wrong colours and no hydration step, and
it works with JavaScript disabled. The toggle is a POST that sets the cookie and redirects
back — the same pattern as every other action on the page.

**Consequences.** The responder page does not read the cookie: a stranger holding a card gets
the light, high-contrast page every time (ADR-021's audience is not the owner).

### ADR-025 — Every channel is a button, and the number is on the page

**Context.** His second test pass: "make all contact options a button on the responders card"
and "display the phone number on the responders card" — superseding ADR-021's split between
buttons and an "available on" line.

**Decision.** All six channels render as buttons, in the contact's own channel order, with
**Call** keeping the solid style and the rest outlined. The stored number is shown, grouped,
directly under the relation, and is itself a `tel:` link.

**Why.** A button is the thing a panicking person aims at; a wall of text is not. Keeping the
number visible also means the page works when a link scheme does not, which is the honest
failure mode for Signal, Telegram and Viber on desktop.

### ADR-026 — JavaScript and custom fonts are for the owner plane only

**Context.** His second pass: "the main platform for card generation and such can use js to
make it more fluid and such. proper modal windows not native browser one. the no js and no
custom font and such limitation is only for the respondent side."

**Decision.** The no-JavaScript, no-external-anything, self-contained rule of D6 now applies
**only** to `/c/*`. The owner plane, the auth pages and the landing page may use JavaScript,
inlined icons, custom fonts and richer interaction. Nothing on the responder plane changes.

**Why.** The responder rule exists because a stranger's phone, on a bad connection, with an
unknown browser, has to see who to call — and because a page that asks for nothing cannot
leak anything. That argument never applied to the owner, who is already signed in.

**Consequences.** Destructive actions use a real `<dialog>` modal with the consequence spelled
out (not `window.confirm`), and the forms keep their plain `action`/`method`, so with
JavaScript disabled the action still happens — the modal is an enhancement, not the
mechanism. Icons are inline SVG in `src/components/Icon.astro`. The card is rendered with
vendored Noto fonts (ADR-027). The responder page keeps its zero-script guarantee, and the
e2e suite still asserts no third-party request and no `<script>` there.

### ADR-027 — The card is set in vendored Noto, found through fontconfig

**Context.** He asked for Noto on the card, with Noto Sans Mono for the labels and the PIN,
and said the noka logo should be an SVG.

**Decision.** `scripts/make-fonts.py` instantiates static weights from the Noto variable fonts
(Noto Sans Regular/Bold, Noto Sans Mono Regular/Bold) and subsets Noto Sans CJK SC down to the
ten Chinese characters the card prints — 6 KB instead of 15 MB. These live in
`assets/fonts/`, and the first render writes a fontconfig file pointing **only** at that
directory (`src/lib/fonts.ts`), so a render is identical here and in the Alpine container,
which has no fonts of its own. The wordmark is generated as outlines by
`scripts/make-wordmark.py` and inlined into the card SVG, so the logo needs no font at all.

**Why.** A card is printed once and kept for years; it cannot depend on whatever fonts a host
happens to have. Subsetting keeps the repository honest (1.6 MB, not 16) and the license is
OFL, which permits it.

**Consequences.** The Dockerfile installs `fontconfig` and copies `assets/`. If the font
directory is missing, `ensureFonts()` leaves the system alone rather than crashing, and the
render falls back to whatever fontconfig finds — degraded, not broken.

### ADR-028 — Tailwind and one token scale on the owner plane; no component framework

**Context.** After the second pass he reported the real problem: "text is all around the place, UI
element sizes are off, random shadows". He asked whether shadcn/ui for Astro or plain Tailwind
would make it cleaner.

**Decision.** **Tailwind v4** (`@tailwindcss/vite`), imported by the owner layout only, with the
whole palette, radius and the single floating shadow defined as CSS custom properties in
`src/styles/app.css` and exposed to Tailwind through `@theme inline` as semantic names
(`bg-surface`, `text-fg-muted`, `border-line`, `shadow-float`). Owner-plane components are built
from three shared pieces: `Button.astro`, the field classes in `ContactForm.astro`, and the card
(`rounded-lg border border-line bg-surface p-4`).

**No shadcn/ui, and no React.** shadcn's components are React; adding a React runtime and island
hydration to a form-driven Astro app to get buttons and a dialog is a large dependency for
markup that already exists here. The interaction it would buy (a modal, a menu) is already built
natively with `<dialog>` and `<details>`.

**Rules that follow, and they are what fixed the report:**

1. Sections are cards on a tinted page; only things that actually float — menus and the modal —
   carry `shadow-float`. There is no second shadow in the project.
2. Type comes from four steps: `text-xl` page title, `text-sm uppercase tracking-wide text-fg-muted`
   section label, `text-base` for contact names, `text-sm`/`text-xs` for everything else.
3. Controls are `h-9`/`h-8` for buttons and `h-10` for inputs and selects, always `rounded-md`.
4. Links inside a sentence are underlined, not colour-only — axe flags colour-only links below
   3:1 against surrounding text, which "Sign in" in a muted paragraph was.
5. Semantic class hooks used by the test suite (`menu`, `kebab`, `panel`, `menu-item`, `danger`,
   `pin`, `url`, `preview`, `contacts`, `add-more`, `error`, `notice`, `tag`, `name`, `meta`,
   `phone`) are kept alongside the utilities, so tests target behaviour rather than styling.

**Consequences.** The responder page imports none of this: it keeps its own hand-written CSS and
its zero-script, zero-request guarantees. Tailwind emits only the utilities a page uses, and that
page uses none. `Button.astro` spreads unknown attributes through to the element — dropping them
silently broke the confirmation dialog once, which is why the spread is documented in the file.

### ADR-029 — The e2e suite owns its server, and it never reuses one

**Context.** Three separate verification mistakes in one session had the same shape: a server was
already running on :3200, so Playwright's `reuseExistingServer` skipped *both* the build and the
restart and silently tested a stale build. That produced failures the current code did not have,
and — worse — passes for code that was not being served. The last one nearly had me "fix" a
correct phone row because the assertion was measured against the old markup.

**Decision.** Playwright builds and starts its own server on **:3300**, with
`reuseExistingServer: false`. The hand-run dev server stays on :3200. :3000 is ghosted and :3100 is
kaja, so nothing collides.

**Why a separate port, not just "remember to stop the server".** A rule that depends on me
remembering has already failed three times today. A port that no other process uses makes the
failure impossible: if something is listening there, the suite fails loudly instead of testing it.

**Consequences.** Every e2e run pays for one build (~1s, incremental). In exchange, "the tests
pass" means the current code passed. The dev server can stay up for a human to click.

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

**On the spelling of the name in the copyright line:** it is the ASCII form,
**Krisztian**, which is how he writes it everywhere it has to work — handles,
registrations, licence files. The accented form, **Krisztián**, is the official
one. Not a typo, and not worth reopening: use the ASCII form in every repository
so the two never drift.

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
