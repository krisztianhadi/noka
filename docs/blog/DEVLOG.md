# Development log

Raw material for posts. Append-only, newest last.

**How this works.** One entry per work block: what shipped, what broke, what I
decided, and the numbers that prove it. Entries are deliberately blunt — the
polished version comes later, and a post is only worth writing if the entry
already contains something a reader would not have guessed.

**Where the posts come from.** **Post drafts are written only on request, after a
milestone — never at the end of every work block.** This log is the raw material
and it stays cheap; turning it into a piece is a deliberate step, taken when he
asks for it and for something worth writing about. If an entry never becomes
useful, that is the log working as intended, not a gap.

When a draft is asked for, it is written in the txt.krisztian.wtf post format
(Jekyll frontmatter, `title` + `date` with `+0700`, no headings in the body),
because that is where it will go — the destination is decided later, the format is
already settled.

**Post ideas so far**

- I wrote the spec before the code, and it saved me twice.
- The decision I reversed: storing the owner's email in plaintext.
- Two bugs my own tests found that a demo would have shipped.
- Making a PDF byte-identical is harder than it looks.
- Designing for a stranger who is having the worst day of their week.
- The licence decision nobody makes until a stranger asks to use the code.
- Four cents for a card, fifty-four for a font: what the cost log says about
  where the money goes.
- The cheapest mistake of the week: doing the work inside peak-pricing hours.

**Drafts**

- [2026-09-29-the-post-it-in-my-wallet.md](2026-09-29-the-post-it-in-my-wallet.md)
  — the product story, unpublished.
- [2026-09-29-four-cents-for-a-card.md](2026-09-29-four-cents-for-a-card.md)
  — the cost story, unpublished, and the one the webchat calls the differentiator.

---

## 2026-09-29 — The contract (`aef81cd`)

**What happened.** Took the pasted technical spec ([../ORIGINAL_BRIEF.md](../ORIGINAL_BRIEF.md))
and read it as a reviewer rather than a builder. Five things in it were wrong or
missing, and the fixes became the plan:

1. The PIN-lockout ladder could not be expressed in the given schema, had
   undefined tier-reset semantics, and contained a read-then-write race.
2. A printed card URL alone could lock the owner's card out for 24 hours —
   permanent lockout on unauthenticated input is a denial of service on a safety
   feature.
3. The public page had no exposure controls: no `no-store`, no
   `Referrer-Policy: no-referrer` (the WhatsApp link would hand the card URL to
   Meta in the `Referer` header), no `noindex`, no `robots.txt` block.
4. The owner could not reprint their own card, because only `pin_hash` was stored.
5. Email was assumed by the sponsor section but never specified, and there was no
   password-reset path at all.

**Decisions.** 31 of them, numbered D1–D31, each with a status. The two that
shaped everything downstream: contact data is encrypted in the application with
the key outside the database (D1), and the guest surface is localised into the
card's own language set rather than being English with multilingual print
instructions (D19).

**Also.** Monetization deferred wholesale. The product name settled as **noka**
(*next of kin access*), which is why the workspace moved; the working title
Nokard is archived and must not reappear.

**Numbers.** PLAN.md: 499 lines of contract, 743 after the review pass.

**What I got wrong.** Two rounds of the spec went into deciding whether a
responder page should be localised, while the far more important question — what
happens when a stranger who speaks only Thai picks up an English-only card — was
sitting in an open-notes list the whole time.

## 2026-09-29 — Scaffold (`1c4da5f`)

**What shipped.** Astro 7 in SSR mode with the Node adapter, Postgres schema and
migrations, the AES-256-GCM keyring module, Crockford base32 slugs, Argon2id PIN
hashing, the five-language catalogue with a completeness test, and the §5 security
headers applied centrally in middleware.

**What broke.** The sandbox: `npm` writes its cache to `~/.npm` (read-only here),
and Astro's telemetry cannot create `~/.config/astro`. Both have config answers —
`.npmrc` pointing the store into the repo, `ASTRO_TELEMETRY_DISABLED=1` — and
both are now in SETUP.md, because the next person hits them in the first five
minutes.

**Decisions.** Slugs are uppercase Crockford base32 so the QR stays in
alphanumeric mode at a low version; the responder page's CSS is inlined, which is
not just a 3G optimisation but a consequence of its own CSP.

**Numbers.** 69 tests, typecheck clean across 29 files.

## 2026-09-29 — The owner plane (`2193abe`)

**What shipped.** better-auth wired to Drizzle, sessions in Postgres,
server-rendered signup/login/logout, a guarded dashboard, and owner passwords
hashed with Argon2id through better-auth's hooks instead of its default scrypt.

**The reversal.** The plan said the owner's email would be stored only as an
HMAC and a ciphertext blob, so a database dump would contain no address at all.
I read better-auth's core schema before trusting it: `email` is required,
lowercased, and is how a sign-in finds the account. Keeping the blind index would
have meant a custom adapter and hooks rewriting every sign-up, sign-in and reset
lookup — cleverness in the one part of the app that must never be subtly wrong.
So the plan decision was dropped, in writing, as ADR-004, with what it costs
stated next to it. The contact data stays encrypted; only the address does not.

**Numbers.** 76 tests, 8 Playwright cases including the full signup → dashboard →
sign-out → sign-in journey.

## 2026-09-29 — The card (`9f24d62`)

**What shipped.** One card per account, a PIN stored twice on purpose (a hash to
verify, a ciphertext so the owner can read and reprint it), rotation that bumps
`pin_version` and kills live cookies, slug regeneration, activate/deactivate.

**Decision worth defending.** A card cannot be switched on with zero contacts.
An active card leading to an empty page is worse than an inactive one, and the
button is disabled with the reason shown.

**Numbers.** 84 tests, 11 Playwright cases.

## 2026-09-29 — Contacts, notes, and the trap in my own tooling (`7d17c95`)

**What shipped.** Encrypted contact CRUD, the relation vocabulary, spoken
languages, notes with a consent line, and card-scoped queries so one account can
never read another's contact.

**Decision.** Phone numbers are not guessed at: a national number without a
country code is refused with a reason instead of being resolved to a country I
assumed. A wrong number in an emergency is worse than a rejected form.

**What broke.** Playwright was driving `localhost`, which resolves to `::1` on
this machine while the server binds `127.0.0.1`. It therefore never reused the
running server, started its own, and produced four test failures that had nothing
to do with the code. I spent a round believing a stale server was the whole
story. Fixing the address fixed the flakiness.

**Numbers.** 106 tests, 15 Playwright cases.

## 2026-09-29 — The responder page (`2d40451`)

**What shipped.** The product: `/c/{slug}`, the PIN POST, `/view`, *Hide now*, the
language switch. One request per page, no JavaScript, no webfont, no third party.
The cookie is validated twice — signature here, card-and-`pin_version` against
the database on every view — so rotating a PIN or switching a card off takes
effect on the next request rather than at cookie expiry.

**Three real bugs, all found by testing rather than by reading:**

1. A POST with no body returned a **500**: `request.formData()` throws when the
   content type is not a form. A bot would have found it before a person did.
2. The PIN page rendered its language switcher only for a real card, so an
   unknown slug produced a *different* page — an existence oracle hiding in a
   layout detail.
3. Astro's global `checkOrigin` rejected the guest form whenever `Origin` was
   absent, which is real webview behaviour. A responder would have seen `403` on
   a card they were holding.

**Numbers.** 138 tests, 19 Playwright cases, axe clean on both responder pages.
Live checks: a wrong PIN answers in 0.353 s and an unknown slug in 0.352 s; the
real card's page and a made-up slug's page are byte-identical apart from the slug
the responder typed.

## 2026-09-29 — Spikes and the container (`749ac7e`)

**What shipped.** The rate limiter's store, wired to Postgres through a
five-line adapter over the driver the app already uses, so the project has one
database driver rather than two. The `rate_limits` table comes from a migration:
the library creates it asynchronously and rejects every `consume()` until that
resolves — a race the first responder would have lost.

**Finding worth a post on its own.** The limiter's counter counts *attempts*, not
allowances: 50 parallel attempts against a limit of 10 store the value 50, and
exactly 10 get through. Easy to misread on a dashboard as "50 successful
unlocks"; the real tally lives in `cards.scan_count`. Second finding: the window
is fixed from the first attempt and never extended, so hammering a card cannot
push the owner's own retry time further away.

**PDF determinism.** Two renders of the same page are byte-identical, with and
without an embedded subset font. Subsetting is the difference between 5.6 KB and
419 KB. A `.ttc` CJK collection cannot be subset at all, so the print phase must
vendor a single-face font rather than reading whatever the machine has.

**The container.** Built on `node:22-alpine` and run against Postgres; the
signup inside it stored `$argon2id$v=19`, which is the only way to know the
native module works on musl rather than on my laptop. It also exposed a version
mismatch: pnpm 10 silently ignores the `allowBuilds` list, and the image was
pinned to pnpm 10. Now pinned to 11, which is the version that wrote the
lockfile.

**Numbers.** 149 Vitest cases, 19 Playwright cases.

**What I got wrong.** I left the rate limiter until after the responder page was
reachable. The order was in the plan and I followed it, but a reachable endpoint
with an unthrottled six-digit secret is the one thing I would not want to explain
if someone asked what state the project is in.

## 2026-09-29 — Putting a price on it

**What happened.** The cost log stopped being a token counter and became a cost
model: tokens attributed per work block, an estimate in USD split by the
provider's peak window, and a balance ledger for the only number that is money
rather than arithmetic.

**What the numbers said.** The whole build is around **$1.27**, of which $1.14
fell inside peak hours — I ran the day's work at 15:20–17:20 local, which is peak
in UTC terms, so I paid double for no reason. Off-peak the same tokens would be
about 63 cents. Per feature it is starker: the card cost **4 cents**, the
responder page **21**, and closing the Phase 0 spikes cost **45** — because that
block was a container build, a font pipeline and library archaeology rather than
my own problem to solve. Cheap where the problem is mine, expensive where it is
someone else's code.

**Decisions.** Attribute cost by goal-round boundary because it is the only
attribution signal the harness logs, and hand-maintain the mapping from round to
feature rather than pretending it can be inferred. Keep the balance ledger
separate from the estimate and label which rows are which: the baseline starts
today, so everything before it stays an estimate forever. And read the peak
window in local time, because "01:00–04:00 and 06:00–10:00 UTC" means nothing when
you are deciding whether to start a long run at four in the afternoon.

**Also.** Found a real bug in my own instrument: the parser skipped every line
without `"usage"` before it looked for round boundaries, so the per-block
attribution silently reported one block instead of seven. The table looked
plausible, which is exactly why it was worth checking against the six rounds I
know happened.

**What I got wrong.** I let the cost of the *wrong* thing dominate twice: paying
peak rates out of impatience, and writing the schema before reading better-auth's
actual requirements (ADR-004). Neither was expensive in dollars. Both were
expensive in time, which is the budget that actually runs out.

**Where this is going.** The webchat's read on it: the cost breakdown is the
differentiator, because the public conversation is either "I made $50k in a
weekend" or "AI is useless". The middle — cheap inference for grunt work, tokens
as a real budget line, honest numbers — is the part almost nobody shows. So this
becomes its own piece, separate from the product story:
[Four cents for a card](2026-09-29-four-cents-for-a-card.md), and it is about this
project only. Costs are never added up across projects: another project lost a
month of session logs, so a combined total would silently under-report. The method
is now the **project-costs** skill.


## 2026-09-29 — His first hands-on pass, and six corrections

**What happened.** He tested the built app and came back with six changes: two password
fields at signup, contacts before the card, reachability channels per contact, no card
on/off switch, "new PIN" and "new QR" merged into one "New card", and the whole owner
plane on a single page. All six are implemented, with 152 Vitest and 23 Playwright tests
green behind them.

**The one that mattered most.** "First I add contacts then I create a card" is not a UI
change, it is a data-model change: contacts and notes were children of the *card*, so the
card had to exist first and reissuing one either orphaned or duplicated the people. They
belong to the **owner** now, and the card is only the thing a QR points at. That is why
the migration is written to copy before it drops — and why the auto-generated version was
wrong: drizzle-kit emitted `DROP COLUMN card_id` first, which would have destroyed the
attribution of every existing contact. I rebuilt the dev database from empty to prove the
fresh-install path instead of trusting the upgrade path alone.

**The bug I shipped and the test caught.** Every endpoint was passing a *sentence* where
the dashboard expected an *error key*, so the page resolved "Start with a country code,
e.g. +66 for Thailand." to "Something went wrong." The type system was happy (both are
strings) and reading the code was too. The browser test that checked the wording found it.

**What he was right about that I had sequenced wrongly.** The card switch existed because
the plan gave it a purpose (gate the guest URL, gate the print endpoints). He used it once
and it produced the worst possible failure mode: a card that looks fine and does nothing,
after which he reported "the PIN doesn't work". The real lesson is not that the feature
was wrong, it is that a safety product should not have a state whose only symptom is
silence.

**Decisions.** ADR-020 (a card is live or it does not exist), ADR-021 (reachability
channels, with text message because a responder may be unable to speak or hear),
ADR-022 (contacts and notes belong to the owner). The plan's contract grows items 15–17,
so the document and the code still agree.

## 2026-09-29 — He drew the card, and the dashboard grew a menu

**What happened.** Twelve changes from his second test pass: the kebab menus, the header and
its hamburger, dark mode, settings, the country picker with flags, the card artwork redrawn
from a mockup he brought, and one rule change that matters more than the styling.

**The rule change.** Deleting the last contact now deletes the card with it, after a
confirmation that says exactly that. The old behaviour refused the deletion and told him to
add someone else first, which is the kind of instruction that leaves a person stuck. The
confirmation is the honest place for the consequence: it names what is lost before it is lost.

**Three bugs the tests caught, all mine.**
1. Every settings result was redirecting to `/dashboard`, so a failed password change lost the
   form. Settings keeps its own page now.
2. The phone input mask stripped the `+`, so a deliberately international number got the
   selected country prepended to it: `+36 30 123 4567` became `+66 363 0123 4567`.
3. `changeEmail` does not work without a mailer — it throws "Verification email isn't
   enabled". Found by probing the API directly instead of guessing from the error key.

**What I had to accept as a design decision.** A password change ends *every* session,
including the current one. I could have reached for a re-login, but the honest reading is that
this is the safe direction for the one action people take when they think someone else has
their password. So the notice now says so plainly, and the owner signs in again.

**Where the printable stands.** His mockup is implemented: five-language heading, the SCAN
line, the QR, the PIN, the wordmark, no owner name. The CJK and Cyrillic text renders from
system fonts on this machine, which is fine here and *not* fine in the Alpine container — the
vendored font is still Phase 7's job, and I would rather say that now than discover it on a
print.

## 2026-09-29 — Noto, real modals, and where the no-JS rule actually belongs

**The rule he corrected.** I had been treating "no JavaScript, no custom fonts, works with
nothing" as a property of the whole product. He pointed out it is a property of *one page*:
the one a stranger opens in an emergency. The owner plane can have modals, icons and Noto,
because the owner is signed in and their browser is known. That is now ADR-026, and the
responder page keeps its zero-script guarantee intact.

**The card.** Noto Sans for the heading, Noto Sans Mono for the labels and the PIN, more room
around the QR, and the noka wordmark as vector outlines rather than text. The Chinese heading
is ten characters, so the font is subset to ten characters: 6 KB instead of 15 MB, and
fontconfig is pointed at our directory only, which means a render no longer depends on what
the host has installed. On Alpine, which has no fonts at all, that is the difference between a
card and a page of empty boxes.

**Two mistakes worth recording.** Generating the wordmark, I flipped the glyphs myself and got
a giant 'n': `SVGPathPen` already flips y for SVG, and my bounds only measured one glyph
instead of the laid-out word. Both were visible in one render — which is the argument for
looking at the output rather than trusting the transform.

**Verified inside the image, not just here.** First attempt was a throwaway SVG with
careless geometry: it proved the fonts resolve, and it looked like a fumbled card, which is
worse than no evidence. So I ran the actual thing instead — the image built, the container
started against Postgres, signed up, added a contact, made a card and fetched
`/dashboard/card/card.jpg`. That is the card, drawn by the production code path inside
`node:22-alpine`, which has no fonts of its own. The Chinese heading crop is pixel-identical
to the same card rendered locally (mean difference 0.00/255), which is what "the font is
pinned" is supposed to mean.

**And one process failure, twice.** Playwright reused the dev server I had running, so two
full test runs reported failures that the new build did not have. The fix is boring: stop the
server before the suite, not after it fails.

## 2026-09-29 — The menu that would not close, and the script that never ran

**His bug report.** "kebab and hamburger menu doesn't close if i click away." Correct: a
`<details>` element has no idea what an outside click is, so it stays open over the page until
it is clicked again. Fixed with a small listener that closes any open menu on an outside click
or Escape, and leaves a click *inside* the menu alone.

**Why it took two attempts.** I first wrote that listener inline in the dashboard page, ran the
build, and found no JavaScript emitted at all. Astro does not process `<script>` tags that
arrive through a slot — the component's slot content is copied through, scripts and all,
without bundling. So the fix was silent: the code was there in the source and absent from the
page. The modal and the phone mask work because they are component-level scripts, and the menu
now is one too. Worth remembering: in Astro, where a script *lives* decides whether it runs.

**Two things this says about my process.** The dev server on :3200 kept serving a build from
before the change, so my own check said "not present" and was right about the wrong thing —
rebuild and restart together, or the verification lies. And the test that clicks "away" cannot
click an element the open panel covers, which is exactly the behaviour a dropdown should have;
the corner of the page is the honest way to express "away".

## 2026-09-29 — One scale, and the honest answer about shadcn

**His report.** "Text is all around the place, UI element sizes are off, random shadows." That is
what happens when every component carries its own CSS: nine type sizes, three radii and a shadow on
things that do not float, because nothing stops them.

**The answer on shadcn/ui.** No, and not because of taste: shadcn's components are React. Adding a
React runtime and island hydration to a form-driven Astro app, to get buttons and a dialog that
already exist as `<dialog>` and `<details>`, is a large dependency for markup I have already
written. Tailwind is the useful half of that suggestion, and it is now in — owner layout only, so
the responder page still ships nothing.

**How it is structured.** The palette, the radius and the one floating shadow are CSS custom
properties; Tailwind sees them as semantic names (`bg-surface`, `shadow-float`). Sections are cards
on a tinted page, only menus and the modal float, type comes from four steps, controls are two
heights. The rule is not "use Tailwind", it is "there is nowhere to invent a value from".

**What axe caught that I did not.** Two things, both invisible to me: the success green failed
contrast at 4.36:1 on its own tint, and "Sign in" inside a muted paragraph sat at 2.95:1 as a
colour-only link. Underlining links in body text is the fix for the second, and it is a better
default anyway.

**The bug I caused with an abstraction.** `Button.astro` rendered only the props it knew about, so
the confirmation dialog's `data-confirm-ok` never reached the DOM and its script threw on a null
button — the modal silently stopped opening. Two of my own tests caught it, which is the argument
for testing the interaction and not the markup. The component spreads unknown attributes now, and
says why.

## 2026-09-29 — "What kind of testing you are doing?"

He found three things in five minutes that my green suite did not: the logo invisible in dark mode,
the country picker stretched across its row, and cards the same colour as the page. He was right to
ask the question. Axe checks contrast *between text and its background*, not between a logo and the
page it sits on, and it has nothing to say about a flex row. Behaviour tests pass in a layout nobody
can use. Green meant "the code does what it says", not "the thing looks right", and I had been
reporting it as if it meant both.

**The bugs.** The wordmark was `currentColor` inside an `<img>`, which resolves against the SVG's
own defaults — black, on a near-black page. The field class carried `w-full`, which beat the
country select's `w-[10.5rem]` because both sit in the same layer and the later rule wins; the
select ate the row and pushed the number input off screen. And `#f6f7f9` against `#ffffff` is a
1.07:1 difference, which is not a difference.

**The tests that would have caught them.** A new `visual.spec.ts` asserts page-versus-card
luminance, the wordmark's contrast in both themes, the phone row fitting at 1280px and at 375px
(stacked below `sm`, side by side above), one control height scale, zero shadows on things that do
not float, and no horizontal overflow at phone width. Three of those assertions were wrong on the
first run and taught me something: I compared an absolute right edge against a row *width*, which
is how a correct layout reads as broken.

**And the reason my verification kept lying.** `reuseExistingServer` skips the build as well as the
restart when a server is already listening. Three times today the suite tested a build from before
the change — twice reporting failures that did not exist, once nearly sending me to "fix" a phone
row that was already correct. It owns its server on :3300 now, and a port nobody else uses means the
mistake cannot happen again (ADR-029). A rule that depends on me remembering has already failed.

## 2026-09-29 — "login is broken", and the build directory I should have separated an hour earlier

**Symptom.** `/login` answered 500 with `ERR_MODULE_NOT_FOUND` for a chunk filename that no longer
existed. Every other page was fine, because Astro imports page modules lazily: the running process
had loaded the pages it had been asked for and held the rest as paths — paths my e2e run had just
deleted underneath it.

**Root cause.** I gave the test suite its own port this afternoon (ADR-029) so it could not reuse a
stale server. It still built into the shared `dist/`, so "the suite always builds" turned a
sometimes-problem into a guaranteed one: any rebuild while the dev server was up invalidated that
server's module graph. Ports were separated; state was not.

**Fix.** One build output per process: `outDir` from `NOKA_OUT_DIR`, the suite builds into
`dist-e2e`, both ignored by git and Docker. Verified the only way that proves anything — ran the
full suite with the dev server deliberately left up, then checked `/`, `/login` and `/signup`
answered 200 with both directories on disk.

**What I should have seen sooner.** Three separate stale-build incidents today, all in the same
family: the suite and the server sharing something they should not. I fixed the port and stopped
there, which is exactly the "one layer deep" mistake this whole session keeps punishing. The rule I
am taking forward: when two processes must not disturb each other, separate *all* the state they
touch — port, build directory, database — not just the one that produced today's error message.

## 2026-09-29 — Auditing the tests, and the bug my own new test would have cemented

**The audit.** He added a testing skill and asked me to run it over the suite. Eleven cases
out, three in. The instructive ones: a whole pdf-lib determinism suite for a renderer that does
not exist yet (every finding already lives in ADR-017, which even says the real test belongs to
Phase 7); two spoken-language cases that restated their own source lists, or duplicated the
catalogue's completeness contract; `reorderContacts` and `isSlug`, both exported and tested and
called by nothing; and a visual assertion that hardcoded control heights — it would have failed
under a padding change while no user could tell the difference. That last one is now a
consistency check: one height per control shape, and shadows coming from the token.

**The bug the audit found.** Writing the channel-link table, I asserted what the helper
returned: `signal.me/#p/%2B…`. That is the "expected value produced by the code under test"
trap, and it was hiding a real defect — Signal's format is `#p/+<number>`, and an encoded
number opens no chat at all (Signal-Android #11627). The button on the emergency page has been
dead for anyone using Signal. Fixed, and the test now asserts the documented format.

**Two guards that existed, passed their tests, and were never called.** `readContactPayload`
was unit-tested but the read path cast the decrypted JSON straight to a type, so an old or
corrupted row would have rendered `undefined` onto the emergency page. `negotiateLanguage` —
q-values, `q=0` refusals, wildcards, all tested — sat unused while the live responder path
hand-rolled a comma split. Both are wired now, which also means the tests are testing the code
that actually runs.

**The pattern worth naming.** Three of this session's bugs have the same shape: a thing exists,
is believed, and is not connected — a limiter nobody calls, a validator nobody invokes, a
negotiator nobody uses, a modal whose `data-*` attributes never reached the DOM. Tests that
exercise a helper cannot see that. Only a test that goes through the real boundary can, which
is where the regression test for the payload validation now lives.

**What I am leaving alone, deliberately.** The limiter module and its storage tests: nothing
calls it yet, but Phase 6 will, and the tests prove the Postgres store is atomic across
instances (ADR-016). I added a comment saying so in both files, because a green limiter test
must not be read as "the PIN endpoint is throttled".

## 2026-09-29 — Brand marks, flags, and a colour that would not stay red

**What he asked for.** Icons on the buttons, brand icons for the messengers, flags for the
languages, and a red destructive item in the kebab — which is a bug report, not a preference:
that item was red in the markup and black on the screen.

**The colour.** The shared `menu-item` class string contained `text-fg`. `text-danger` does not
win against it, because both live in one cascade layer and document order decides, not the order
I wrote them in the attribute. It is the same trap as `w-full` beating `w-[10.5rem]` on the phone
field, one day apart, and I only noticed because he looked. The fix is a rule now: a shared class
string carries layout, and each item states its own colour. I verified it by reading the computed
colour instead of trusting the markup.

**The brands.** Inlined from simple-icons' CC0 path data through a generator script, so the
shapes are exactly as published and reproducible, and nothing is fetched at runtime — the
responder page's zero-request promise survives having four brand marks on it. Used nominatively:
they label the service each button dials.

**The flags.** Emoji, keyed off the language code, always beside the written language name. A
flag is not a language — English is not only Britain — and on Windows they fall back to letter
pairs, which is fine because the name is right there.

**The oversight this exposed.** The responder suite checked "fetches nothing external" against
`/c/{unknown}` — the PIN form, which has no channel buttons on it. The page that actually carries
`wa.me`, `t.me`, `signal.me` and `viber://` links had never been checked, and the old allowlist
would have rejected them anyway. The contract is now split the way the platform splits it: a
**resource** is a `src` or a `<link href>` and must be local; a **navigation** is an `<a href>`
and may dial a service. Ran on the unlocked view too, which is where the buttons are.

## 2026-09-29 — Nine notes from a walkthrough, and three of my own silent mistakes

**What he caught.** No icons in the service checkboxes. "Text message" sitting among the
messengers instead of being its own statement about the person. A chevron in the wrong place. The
edit form opening **inside the kebab menu** — his words, "epic bug", and he is right: a form in a
dropdown is a form you fight with. Save notes that can be pressed when nothing changed. No way to
cancel an add. A contact row that read like a pile. A header floating on the page. And responder
buttons whose icons were misaligned and colourful for no reason.

**The one that changed the model.** Text message was a service. It is not: a service is *where* a
number can be reached, and "cannot speak or hear" is *who the person is*. Two different things
were sharing one list, which meant the owner had to infer a capability from a subscription and the
responder page could not say the sentence that matters most for that contact. It is now
`text_only` in the payload (schema 4), its own checkbox with the reason written under it, stated on
the card page in the contact's language, and the Text button appears because a call would be
useless.

**Three of my own mistakes, all silent.** An `str.replace` in an edit script matched nothing, so
the dashboard behaviour was never added — the page simply did nothing, and only a probe that read
the DOM caught it. The chevron CSS went into a component that has had no `<style>` block since the
Tailwind rewrite. And `ChannelIcon` fell through to a line-icon branch for the four brand channels
when `branded` was false, rendering empty `<svg>` elements: the screenshot looked *nearly* right,
which is exactly why I measured `pathLen` instead of trusting my eyes.

**The habit worth keeping.** Every one of those three was invisible in a diff and obvious in a
measurement — a computed colour, a bounding box, a path length. Reviewing my own patch is not
verification; running the thing and reading numbers is.

## 2026-09-29 — "You got really sloppy lately", and he is right

**What he found.** Two edit controls on one contact: a pencil beside the kebab and an "Edit
<name>" summary underneath, because I added the first and forgot the second existed. A form
default of spouse where partner is the obvious answer. And the PIN page and the unlocked page had
drifted apart — flags on one, bare names on the other — so the same plane looked like two products
depending on whether the PIN had been entered yet.

**And then I made it worse in the same pass.** Editing the responder layout, I replaced a slice of
CSS from `.text-only` to `.langs`. Between those two rules sat `.actions`, `.actions a`, `.call`
and `.notes`. Every channel button turned into a bare underlined link, and I had already taken the
screenshot that showed it — I simply did not look at it before committing. axe was happy: unstyled
links are still links, still contrasty, still labelled. Only looking at the page could see it.

**What I am changing about how I work, not just what I fixed.** The pattern in all three of today's
reports is the same: I verify the thing I was thinking about and not the page I am shipping. So:
after a change that touches markup or CSS, look at *every* affected page — this time all four —
before committing, and read the screenshot rather than taking it. Where a property is measurable,
measure it in the suite rather than trusting my eye: the channel buttons now have to be at least
44px tall with a visible border, which is exactly the check that fails when a stylesheet loses its
rules.

**The fixes themselves.** One edit control per contact (the pencil; the summary is sr-only so the
form stays keyboard-reachable). Partner as the default relation. One `LanguageSwitcher` shared by
both responder pages. The text-only fact is an alert box in the contact's language, and that
contact is not offered a call at all — text leads, the messaging apps follow, because they all
open a chat.

## 2026-09-29 — A footer, and the retention job that was only a line in package.json

**What he asked for.** A footer like the sibling project's: made-by line, legal links, owner
surfaces only. Straightforward, and the responder plane keeps its one job — show the people to
call, nothing else. The suite now asserts the footer on every owner page and its absence from
`/c/*`, because "only where it belongs" is a contract, not a layout choice.

**What it turned up.** Writing the privacy page, I went to check the retention claim before
writing it down and found `pnpm purge` pointing at `scripts/purge.mjs`, a file that has never
existed. The plan's D24 promises the scan audit trail is deleted after 30 days, with a dry-run
mode, from a cron service. The privacy page was one paragraph away from stating a policy that no
code implements.

**So the claim is backed now.** The deletion and its boundary live in `src/lib/retention.ts`; the
script is a thin cron entry point that can also say what it would do. The integration test pins
the boundary against the real database — 31 days goes, exactly 30 days stays, a dry run changes
nothing, a second run finds nothing — because "30 days" is precisely the number a privacy policy
asserts and nobody ever checks.

**One piece of plumbing worth keeping.** The purge script could not import the app's source: Node
strips the types but has no idea what `@/` means, and the imports have no extensions. The
temptation was to write the purge SQL straight into the script, which would have left the tested
function and the running code as two different things. Twenty lines of loader hook later, a script
can import `src/` the way the app does — and the next maintenance script gets it for free.

**The honest note in the privacy text.** Export and account deletion are not self-service yet, so
the page says the email route is the route until that flow exists. A privacy page that overpromises
is worse than one that admits a gap, and it is the one page a person reads when they are already
worried.
