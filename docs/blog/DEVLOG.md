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
