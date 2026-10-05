# Changelog

Newest first. Dated, tagged **Feature** / **Fix** / **Break**.

## 2026-10-01

### Fix — every write path is transactional

The two external reviews agreed on the defect class: each write path was a
read-then-write, and a second tab or a double click walked into the gap. Five
fixes, and every regression test was run against the pre-fix code first.

- Last-contact deletion counts and deletes in one transaction under a per-owner
  advisory lock. The race test runs it across twelve owners, because with one
  owner the old code passes.
- Card creation is `insert … on conflict do nothing` against the partial unique
  index, then reads the winner back. Two clicks used to pass the existence check
  together; one then hit the index and 500ed after two Argon2 hashes.
- Contact ordering is `max(sort_order) + 1` inside the insert statement, under the
  same lock. Racing adds used to claim one position, and the insert no longer
  decrypts every contact to count them.
- The PIN audit row and its counter commit together, and a failed audit is logged
  rather than thrown — the audit must never stand between a person in the street
  and the phone numbers. Fault-injected for real, with a card id that violates the
  foreign key.
- Export reads the account, card, contacts, note and scan history in one
  repeatable-read transaction. Services take an optional executor so a caller can
  pass its own transaction in.

### Fix — the limits live in the service, not the HTML

`maxlength` existed only in the markup, so a direct POST stored whatever it
liked: arbitrarily long names, an unbounded note, or a twenty-first contact —
encrypted, with the emergency page paying for it on every scan.

- `MAX_NAME_LENGTH` 80, `MAX_NOTES_LENGTH` 2000, `MAX_CONTACTS` 20, checked inside
  the same transaction and under the same per-owner lock as the insert, so two
  adds cannot both be the twentieth. Each refusal has its own sentence in five
  locales, and the boundary value still saves.
- At the cap the dashboard shows one sentence where the add form was, instead of a
  form that will be refused.
- A note with no spaces in it no longer widens the responder page:
  `overflow-wrap: anywhere` there, `break-words` on the dashboard's rendered note.

### Fix — the email change needs the password, and Origin-less POSTs are not refused

- Changing the account email now requires the current password, compared with the
  same Argon2id path the password form uses. The email is the only recovery channel
  an account has, so a stolen session could previously redirect it permanently. The
  e2e test asserts a wrong password leaves the address exactly as it was.
- `isSameOrigin` falls back to `Referer` when `Origin` is missing, so a plain form
  post through a proxy no longer gets a 403 on every dashboard POST. Both headers
  missing is still a refusal.

### Fix — counted text follows the language's own plural rules

The dashboard picked between one and many by hand, which cannot express Russian:
1 контакт, 3 контакта, 5 контактов. It was wrong for most numbers, and wrong in the
way a native speaker notices immediately. `src/lib/plural.ts` selects the category
with `Intl.PluralRules`, and the catalogue carries
`owner.contacts.count.{one,few,many,other}` in all five locales — a language uses
only some of them, and the type requires parity. French's zero-as-singular comes
free.

### Fix — the phone field cannot hold a number the server would refuse

E.164 caps a number at 15 digits including the country calling code, so the
national part gets 15 minus the dial code's length.

- The mask caps per country, and changing the country re-caps what is already
  typed; a pasted number that starts with `+` carries its own code and keeps all 15.
- The static `maxlength` of 18 counted spaces and the plus, so it quietly ate pasted
  digits: an international number was truncated at 13 digits. The true maximum is 20
  characters.
- The hint says what to do and why there is a limit, instead of explaining jargon.

### Fix — the card link works from wherever it is read

`.env` carried `PUBLIC_CARD_ORIGIN=http://localhost:3200`, and the dashboard link
said `localhost` — an address that resolves on the machine that served it and
nowhere else.

- The dashboard link is relative (`/c/{slug}`), so it cannot be wrong from any
  address. The address shown beside it, and the URL baked into the JPEG and the
  print PDFs, come from `src/lib/card-origin.ts`: a configured origin wins whenever
  a phone can reach it, and a loopback configuration is treated as the development
  default it is, so the request's own host is used instead (`X-Forwarded-*`
  included).
- Five unit tests: a reachable configured origin is kept, a loopback one is
  replaced by the request host, the proxy headers win, a trailing slash is stripped,
  and an unparsable configuration is kept rather than silently rewritten.

### Fix — the empty card keeps its place, and says what to do

- The card block is present on every dashboard: a real card, or a dashed
  placeholder with the same footprint saying "Your card appears here". That removed
  the condition three states used to hide behind, and keeps the note's context when
  the last contact is deleted.
- The placeholder's message is direction-free — "A card needs at least one contact.
  Add one to make it." — because the form is above on a phone and to the left on a
  desktop, so "above" was wrong in one of the two layouts.
- The download block is "Download and print", not "Print": the button downloads a
  file and the printing happens elsewhere. All three PDFs open in a new tab with
  `rel=noopener`, because opening one in the current tab takes the owner off the
  dashboard and with it the PIN and the link they were about to copy by hand.

### Test — three review findings closed by measurement

- `tests/unit/card-artwork.test.ts` rasterises the card once per language and once
  with all five, reads the ink bounding box out of the pixels, and asserts clear
  paper inside every edge. The control matters as much as the assertion: an
  oversized phrase must fail the same property, or a measurement that always
  returned the full canvas would look like a passing test.
- Six exports race four rotations, then two more run once the card has settled. A
  file whose PIN belongs to the card that exists now must also name that card,
  which is the mixing case. Rotation updates the row's slug rather than inserting a
  new row, so an older generation cannot be looked up afterwards.
- The longest name the form allows with no space in it, and a note that is one
  400-character URL, are measured as `scrollWidth − innerWidth` on both planes; the
  responder's name is asserted to still be present in full, so a fix that clipped
  it into one character could not pass.

### Docs — the local server's death is expected, and three files caught up

- `docs/SETUP.md` says why the server on :3200 dies with a harness restart: the
  sandbox runs `--die-with-parent` in its own PID namespace, so nothing started
  inside it can outlive the harness — `nohup` and `setsid` included. The check is a
  one-liner: look at :3200, restart the built server, curl loopback and LAN.
- `docs/API.md`, `docs/INDEX.md` and `docs/PLAN.md` were refreshed to match the code
  that day; the status column had drifted on the print routes, the policy pages and
  `scripts/purge.mjs`, and `docs/PLAN.md` still opened with "pre-code".

## 2026-09-30

### Feature — the print masters: the card, one on A4, ten on A4

He asked for three files, and that is what the dashboard offers: the card at exactly
53.98 × 85.60 mm for a print shop, one card on A4 for a home printer, and ten on A4
for a stack.

- The artwork is the same SVG as the preview, rasterised at 600 dpi, embedded once
  per document and drawn as many times as the layout needs — ten draws of one image
  is why the sheet is 1.06 MB and not ten times that.
- Ten cards fit on A4, not the nine a portrait grid gives: rotated a quarter turn,
  85.6 mm divides into 210 mm twice and 54 mm divides into 297 mm five times. 2 × 5
  with an 8 mm margin and a 2 mm gap; at 4 mm the fifth row falls off the page and
  the sheet loses a card. Corner cut marks in grey sit just outside each card.
- Measured against the standards themselves: ISO 216 for A4 (595.28 × 841.89 pt) and
  ISO/IEC 7810 ID-1 for the card (153.01 × 242.65 pt), ten positions inside the
  printable area, and one embedded image per document. `pdf-lib` moved from
  devDependencies to dependencies — it is production code now.
- Left in the phase: the no-PIN variant behind a blunt warning, deterministic PDF
  bytes (the JPEG preview is deterministic; the PDFs carry a creation timestamp on
  purpose), and the physical print/scan test with three phones at 10–30 cm, which
  needs hands rather than code.

### Feature — `/demo` runs the flow, not a picture of the end of it

A demo that shows the contact list answers the wrong question; the question is what
happens when you scan the card.

- `GET /demo` is the PIN page as a real card shows it, with the demo PIN already
  typed in and a banner saying what it is. `POST /demo/enter` compares a constant and
  sets an hour-long cookie — it deliberately does not reuse the responder code,
  because a demo path that touched the real table would be a liability for nothing.
  `GET /demo/view` renders invented people through the responder layout and
  stylesheet; `POST /demo/exit` is the way out.
- The sample card was re-rendered with its PIN printed as 123 456 and its QR pointing
  at `/demo`, and the landing links to it under the card.
- Tested end to end (PIN → contacts → exit), `/demo/view` is asserted unreachable
  without the PIN, and the demo joined the axe sweep.

### Design — landing: two copy reviews, then six notes from his review

- Rewritten from two independent copy reviews, then the visual pass: no hero trust
  strip, no "Sample card" pill, mustard as the page's one loud action (ink on the
  post-it panel, because mustard on mustard pointed at nothing), icons per limit and
  per step, a visible card edge in light mode (`border-line-strong` plus a new
  `shadow-card` token — the old border sat 2% away from the page background and
  disappeared), and "what noka does not do" as a full-width ink band with the dot
  texture instead of a white card.
- Copy corrections that mattered: noka generates a printable card, it does not print
  one; and nothing is advertised that is not built.
- Rounding and calm: the "does not do" plate is rounded like the privacy strip, the
  cards no longer lift on hover, the closing post-it sits straight, and the three
  steps went back to the previous design — big mono numerals, icon beside the title,
  a rule threaded between the numbers. Anchor links glide only for readers who have
  not asked their system for less motion.

### Design — dashboard and card, from a model that cannot see

GPT-5.6 Sol ran over both surfaces against a measured brief of every element
(computed size, weight, color, box, margin, padding, radius, border, shadow), since
it cannot read a screenshot.

- Its headline finding was an implementation bug of mine: the card page declared the
  phone number at 2.5rem but it computed 30.42px on a 390px phone, so the contact's
  **name** (40px) outranked the number a stranger actually needs. The number now
  leads at 40px and the name drops to 32px — which required leaving the monospace
  face, because at 40px mono needs 360px for a full international number and the
  phone has 318.
- Rhythm tightened structurally rather than by shrinking touch targets (contact
  padding 32 → 24px, meta gap 8 → 4px, actions 24 → 16px), and every channel row
  keeps 52px. A contact who cannot hear now shows the constraint before the number,
  with their text action as the solid one.
- Dashboard: contacts and notes are the left column, the card a 22rem sticky status
  plate on the right. The plate is the one ink surface on the owner plane — which is
  also what stopped it reading as one more settings card — and axe caught
  `#5b6270` on `#14161a` at 2.95:1 the moment it went dark.
- The added column squeezed the phone field to 126px inside a 720px shell; the
  dashboard shell is `max-w-5xl` now (a `wider` prop, never available to form pages),
  the split waits for `xl`, and the number field is 382px.

### Feature — the note behaves like a contact, and the first save makes the card

- Three review notes, all one idea: stop explaining steps that do not need to exist.
  Saving the first contact creates the card — a card with nobody behind it is not a
  state the product has, so the second press was a step to explain rather than a step
  to take. `POST /dashboard/start` writes the contact and then the note, because the
  owner typed one screen and a half-saved first run was not an option.
- The note renders with the same kebab the contacts get (Edit note, Delete note), and
  its form lives in the page behind Edit, never in the menu panel. The contact fields
  moved to `ContactFields.astro`, so there is one source of truth for the fields and
  two wrappers around it.
- The open sheet's submit follows the form's own `checkValidity()`, so an empty
  first-run form cannot be submitted, and the note-only form is exempt because its
  rule is about having changed something rather than about being complete.
- Two bugs found by doing it: the "Save is dead until something changed" rule had
  disabled the *first-run* save button, so a new owner could never save anything; and
  the note existed twice on a first run, in two forms with the same field id.

### Fix, copy, brand, responder polish

- **The phone field could hold a number the server refuses** — it was found here, by
  him typing a number longer than E.164 allows and getting the refusal back; the fix
  is in the 2026-10-01 entry.
- **Copy:** the landing's encryption talk is plainer, the limits are statements, and
  the page says it runs no JavaScript.
- **Brand:** the real noka logotype on both planes and on the card, a favicon cut from
  its `n`, and the card's own polish — a bigger heading, a smaller PIN, even white
  space on all four sides.
- **Responder polish:** one type scale with the phone number leading, one heading with
  the name, one channel per row, flags for spoken languages, the hearing mark on the
  alert, the muted-speaker emoji for "text only", and 📞 / 💬 drawn as decoration. The
  sign-in button had been wearing the sign-out icon.

### Docs — day two reflection and the measured cost

- `docs/blog/2026-09-30-five-millimetres.md` — the day written up for strangers: the
  design review from a model that cannot see, axe as a design reviewer, the layout
  change that squeezed a phone field to 126px, the E.164 limit that let him past it,
  and the division that fits ten cards on A4 instead of nine.
- `docs/blog/DEVLOG.md` — the same day as a working note, with the two stale-server
  mistakes named as a pattern rather than an accident.
- `docs/COSTS.md` — day two's balance delta **$3.96**, project total **$5.69**,
  measured by sampling the provider's balance rather than by applying a rate table to
  token counts. The design and review runs stay unpriced: they are on an account that
  serves other work.

## 2026-09-29

### Feature — cost per feature, across projects, and what to do with the numbers

- `scripts/usage-report.mjs` now attributes tokens and estimated USD **per work
  block**, splitting the main session at the goal-round boundaries in the log, and
  reports **every workspace the harness has logged** with `--all`.
- The reading of it is in docs/COSTS.md: the card cost **$0.04**, the responder
  page **$0.21**, and closing the technical spikes **$0.45** — cheap where the
  problem was mine, expensive where it was someone else's code to read.
- **Peak/off-peak in local time:** peak is 08:00–11:00 and 13:00–17:00 +07,
  Mon–Fri; off-peak everywhere else and all weekend, at half price. The day's work
  ran at 15:20–17:20 local, inside peak, so half the bill was avoidable by
  starting two hours later. Recorded as the first item under "what I would not do
  again", with three more.
- New draft in his post format: `docs/blog/2026-09-29-four-cents-for-a-card.md`
  — the cost story as its own piece, framed as cost per shipped artifact rather
  than scarcity, with the numbers and the honest negatives.
- Fixed a bug in my own instrument: the log parser skipped lines without a usage
  object before looking for round boundaries, so per-block attribution silently
  collapsed to a single block. Caught because the table disagreed with the six
  rounds that actually happened.
- **Costs are now strictly per project.** The cross-project mode is gone from the
  script and the file, and docs/COSTS.md says why: session logs can be lost, so a
  combined total silently under-reports. The method lives in the new
  **`project-costs` skill** (with the script), so each project gets the same file,
  ledger and rules — separately.

### Feature — real money in the cost record, and two standing conventions

- **`docs/COSTS.md` now shows time windows and USD.** Each session is bucketed by
  its own timestamps into the provider's peak and off-peak windows (peak is
  01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public
  holidays; off-peak is half price), with both UTC and local `+07` columns, so the
  rate that applied to each hour is visible rather than assumed. Current estimate
  for the whole build: **$1.25**, of which $1.14 fell in peak hours.
- **A balance ledger for actual USD.** The provider exposes no per-day spend
  endpoint, but it does expose the balance, so `scripts/usage-report.mjs
  --balance "note"` samples it and the difference between two samples is money
  the provider deducted itself. Baseline recorded at **$28.97**.
- **The AI disclosure is now a standing rule**, not a one-off: added to the
  project-docs skill, which every future project loads when its README is written.
  Hand-written and AI-enhanced, the tooling named, and a pointer to the commits,
  ADRs and devlog as the evidence.
- **The name in the copyright line is settled:** ASCII **Krisztian** in licence
  files (the official accented form is Krisztián), recorded in ADR-018 so it is
  not re-litigated per repository.

### Feature — monetization policy, the encryption delta, and a cost record

- **Monetization policy written down (D32, §18, ADR-019):** users are never
  charged — not a tier, not a trial, not a "pro" plan; revenue, if any, comes from
  project sponsors and whitelabel arrangements; user data is never sold, shared or
  brokered; and the product is never sold into closed source. The ADR states what
  MIT does and does not enforce, so the last promise is a commitment rather than a
  licence term.
- **The encryption change is now in the plan's own delta list** (item 13) rather
  than only inside D1 and ADR-003: the spec asked for `pgcrypto`, the project does
  AES-256-GCM in the application, and the README says why in one paragraph —
  including the one plaintext exception (the owner's email, ADR-004).
- **`docs/COSTS.md` created, with a generator.** `scripts/usage-report.mjs` reads
  the harness session logs and reports exact token totals per session; the file
  explains why there is no money column (rates change by time of day, so tokens
  are not a price) and how to turn the totals into one from the provider's
  billing page. First run: **369 turns, 107,148,435 total tokens** across six
  sessions, of which 106.3 M are cached prompt reads.

### Feature — MIT licence, and the ADR that explains it

- `LICENSE` (MIT, Copyright (c) 2026 Krisztian Hadi) and `"license": "MIT"` in
  package.json, so GitHub detects it. README and DECISIONS.md updated; it is no
  longer an open decision. ADR-018 records the reasoning, including what MIT
  knowingly gives up and why AGPL and source-available were rejected.
- The blog drafts now follow the txt.krisztian.wtf post format — Jekyll
  frontmatter with `title` and a `+0700` date, no headings in the body and no
  bullet lists — because that is where they will be published once there is a
  post worth shipping.

### Feature — documentation restructured for readers

- **README rewritten to tell the story** instead of only explaining setup: why
  the project exists (a post-it in a wallet is the competition), how the two
  planes work, the threat model in plain words — including what is *not* honest
  to claim about it — what is deliberately absent in v1, what is next, and what
  the tests actually prove. Still under the 200-line cap.
- **`docs/DECISIONS.md` created**: the 17 ADRs moved out of ARCHITECTURE.md into
  their own register, with a status table, the four still-open decisions, and
  ADR-004 — the one decision the project reversed — kept in full.
- **`docs/blog/` started**: `DEVLOG.md` (append-only raw material, one entry per
  work block, with what broke and what was decided) and
  `2026-09-29-the-post-it-in-my-wallet.md` (first post draft, marked unpublished).
- ARCHITECTURE.md now links to the register instead of duplicating it, so there
  is one home for each decision.

### Feature — Phase 0 spikes finished (rate limiter, PDF determinism)

- `rate-limiter-flexible` with its Postgres store is wired up behind a five-line
  adapter over the postgres.js client we already use, so the project has one
  database driver, not two (ADR-016). `pg` was installed for the spike and
  removed.
- The `rate_limits` table comes from migration `0002_rate_limits.sql`: the store
  creates it asynchronously and rejects every `consume()` until that resolves,
  which the first responder would have hit.
- Verified: 50 concurrent attempts on one key allow exactly `points` and refuse
  the rest, with no lost updates; two instances share one counter. Recorded the
  property that is easy to misread — the counter counts *attempts*, the window is
  fixed from the first attempt and never extended, and `msBeforeNext` is what
  `Retry-After` will use.
- PDF determinism spiked (`scripts/spike-pdf.mjs`): two renders of the same page
  are byte-identical, with and without an embedded subset font; no random `/ID`,
  no implicit dates. Subsetting is the difference between 5.6 KB and 419 KB.
  Recorded the two limits Phase 7 must respect — a `.ttc` CJK collection cannot
  be subset, and determinism is per pdf-lib version and font bytes (ADR-017).
- Tests: 5 hermetic PDF determinism cases and 6 rate-limiter store cases,
  including the 50-way concurrency proof.

### Feature — the production container is verified

- `docker build` on `node:22-alpine` succeeds, and the running container serves
  `/healthz` (database up), the responder page, and a full signup: the stored
  password came back as `$argon2id$v=19`, which proves `@node-rs/argon2`'s musl
  prebuild loads in the deploy target — the last open Phase 0 spike.
- The image now installs **pnpm 11.24.0** (the version that wrote the lockfile)
  instead of kaja's 10.12.1: pnpm 10 silently ignores `allowBuilds`, and kaja's
  reason for pinning 10 (verify-deps-before-run in non-TTY) cannot apply here
  because the container never invokes pnpm at runtime.
- `.npmrc` is no longer copied into the image; it points pnpm's store at a
  sandbox-local `.tmp` path.

### Feature — Phase 5: the responder page

The product works end to end locally: sign up → card → contacts → switch on →
scan-equivalent URL → PIN → localised contacts, with zero JavaScript.

- Guest plane: `/c/{slug}` (localised PIN form), `/c/{slug}/view`,
  `POST /c/{slug}/hide`, `POST /c/{slug}/lang`. All four are plain form POSTs.
- Signed 15-minute view cookie scoped to `Path=/c/{slug}`, validated against the
  database on every view, so a rotated PIN or a deactivated card takes effect
  immediately (ADR-015). An unrelated card's cookie cannot open it — verified.
- Layer 0 of §6: unknown slugs and deactivated cards get a decoy Argon2
  verification, a 350 ms response floor, and a page that is byte-identical to a
  real card's apart from the slug the responder typed.
- The card's language set drives the page: `lang` cookie → `Accept-Language` ∩
  card set → card default. Verified in Russian in a real browser.
- Audit rows and counters (D25): successes increment `scan_count` and set
  `last_viewed_at`, failures only set `last_failed_at`; both write a
  `scan_attempts` row with an HMAC'd IP prefix, never a raw address.
- One request per page: CSS is inlined, no webfont, no image, no third-party
  anything. The view renders in ~3.4 KB uncompressed.

### Fix — two defects the responder work surfaced

- A POST with no body or an unknown content type got a **500** out of the PIN
  page: `request.formData()` throws. Every form now parses through `readForm()`
  (ADR-014).
- The PIN page rendered its language switcher only for a real card, so the page
  **differed** for an unknown slug — an existence oracle. It now renders the
  default set when there is no card.
- Also: Astro's global `checkOrigin` 403'd the guest form whenever `Origin` was
  absent, which is a real webview behaviour. It is off; our own same-origin
  checks cover the owner plane (ADR-014).

### Feature — Phase 4: contacts and notes

- Contact CRUD (`src/lib/contacts.ts`) with every value encrypted before it
  touches the database and decrypted per read, never cached (ADR-013).
- Relation and spoken languages are vocabulary codes inside the payload, so the
  responder page can translate them. The spoken-language list (13 codes) is
  deliberately wider than the card's five print languages, with labels in all
  five UI languages — which the catalogue's completeness test now covers.
- Phone numbers are normalised to E.164 with **no country inference**: a
  national number without `+` is refused with a reason instead of being guessed
  at (ADR-013).
- Dashboard pages: contacts list with Call/WhatsApp links and spoken-language
  chips, create, edit, delete, and the notes editor with the consent line.
- Two rules live in the service, not the pages: every query is scoped by
  `card_id`, and the last contact on an active card cannot be deleted (D28).
  A card can now be switched on.
- Tests: 106 Vitest cases (9 new integration ones) and 15 Playwright cases, axe
  clean on the contacts and notes pages.
- Playwright now drives `127.0.0.1` rather than `localhost`, which is what made
  server reuse flaky on this machine.

### Feature — Phase 3: the card

- Card lifecycle service (`src/lib/cards.ts`): exactly one card per account,
  idempotent creation, PIN rotation, slug regeneration, activate/deactivate,
  and `cardUrl()` for the QR target.
- The PIN is stored twice on purpose (ADR-011): `pin_hash` to verify,
  `pin_encrypted` so the owner can read and reprint their own card while it is
  active. The dashboard shows it grouped — `123 456` — which is what gets
  printed.
- Activation is gated on having at least one contact (D28); the dashboard
  disables the button and says why. Deactivation is always allowed.
- `/dashboard/card` plus POST-only, origin-checked endpoints for rotate-pin,
  regenerate-slug, activate and deactivate; the `/dashboard` shell now shows the
  card state, contact count, PIN and responder URL.
- The owner guard moved into middleware (ADR-012): `/dashboard/*` redirects to
  `/login` without a session and publishes `Astro.locals.owner`, so no page
  re-derives the session and no new route can forget the guard.
- Tests: 84 Vitest cases (8 new card-lifecycle ones against real Postgres) and
  11 Playwright cases, axe clean on the card page too.

### Feature — Phase 2: the owner plane

- better-auth wired to Drizzle with its own tables (`users`, `sessions`,
  `accounts`, `verifications`), plural names and uuid ids, sessions in Postgres
  so revoking one is a server-side act. Migration `0001_unique_maelstrom.sql`.
- `cards.user_id` is now a real foreign key with `ON DELETE CASCADE` — ADR-008
  closed, with a test that a card whose owner does not exist is rejected.
- Owner passwords are **Argon2id** through better-auth's password hooks instead
  of its default scrypt (ADR-009), so the app has one KDF.
- `/signup`, `/login`, `/logout`, the `/api/auth/*` catch-all, a guarded
  `/dashboard` shell, and a shared `<Plain>` layout. Both forms are plain HTML
  POSTs that forward better-auth's cookie on a 303 — no client JavaScript.
- Every state-changing POST is origin-checked; `/logout` is POST-only.
- Tests: 76 Vitest cases (auth included) and 8 Playwright cases; the owner
  journey signup → dashboard → sign out → sign back in runs in a real browser
  and axe is clean on both auth pages.
- Verified by hand against the built server: signup sets an `HttpOnly`,
  `SameSite=Lax` cookie, `/dashboard` greets the owner, a cross-origin logout is
  `403`, and the session row is gone after sign-out.

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
