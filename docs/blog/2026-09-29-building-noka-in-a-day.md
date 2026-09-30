# Building noka with an AI pair — one day, one working app, and three mistakes worth writing down

*A reflection on 2026-09-29: the day noka went from a spike to something a stranger could use.*

noka is a more elegant way to keep a handwritten note in your wallet. A card the size of a bank
card, with a QR code and a six-digit PIN. Someone finds you on the street, scans the code, types the
PIN, and gets the people to call — with buttons that actually dial. It is deliberately boring
technology doing one anxious job well.

I built it in a day, together with DeepSeek V4.1 Flash in DeepSeek Harness. This is what that was
like, including the parts I would rather not put in writing.

## What the day actually produced

Thirty-one commits, all with a green suite at the end: an Astro 7 application with two planes that
have opposite rules. The owner plane — dashboard, settings, sign-in — may use JavaScript, icons and
modals. The responder plane may not: `/c/*` ships no script, no external request, no analytics, no
font from a CDN, nothing. A page a frightened stranger opens on a bad connection should be one
self-contained file, and that constraint turned out to be the most productive design decision of
the day. Every time a feature wanted to reach for a library, the constraint asked why.

By the end: encrypted contacts, a PIN that can be rotated, a card that prints with a QR code,
self-service data download and account deletion, a 30-day retention purge, a footer, legal pages,
and the whole interface in five languages. 155 unit and integration tests, 45 browser tests.

## The three mistakes

**One: I shipped a stylesheet with the buttons deleted and did not look at the screenshot.** I was
editing the responder page's CSS, replaced a slice of it, and the slice took `.actions`, `.call` and
`.notes` with it. Every channel button became a bare underlined link. The accessibility test passed
— unstyled links are still links, still contrastive, still labelled. I had already taken the
screenshot that showed the damage; I simply had not looked at it before committing. The fix was
restoring from git in one command. The change to my process matters more: after touching markup or
CSS, look at **every** affected page, and where a property is measurable, assert it. The suite now
requires each channel button to be at least 44 pixels tall with a visible border, which is exactly
the check that fails on a mangled stylesheet.

**Two: a privacy policy that was one paragraph away from a lie.** Writing the privacy page, I went
to check the retention claim before stating it — and found `pnpm purge` pointing at a script that
had never existed. The plan promised a 30-day purge of the attempt audit trail; no code implemented
it. The page would have said "deleted after 30 days" about a table that grew forever. It is
implemented and tested now, boundary included, because "30 days" is precisely the number a policy
asserts and nobody checks.

**Three: two edit controls on one contact.** I added a pencil button to the row and forgot that an
older "Edit" summary was still sitting under it. He caught it immediately, along with a spouse
default where partner was the obvious answer, and a PIN page that had drifted away from the
responder page it shares a design language with. His verdict was fair: *"you got really sloppy
lately"*. The pattern in all three reports was the same — I verified the thing I was thinking about
and not the page I was shipping.

## What the AI was good at, and what it was not

**Good at:** the unglamorous middle. Encrypted payload schemas with version migration, phone number
normalisation across countries, Argon2id and AES-GCM wiring, a Playwright suite that owns its own
port and build directory, the CSS for a card that prints at exactly 638 × 1011 pixels. Volume work
where correctness is checkable and the answer is knowable. I have never written this much
well-tested code in a day.

**Bad at:** knowing when it was done, and knowing when it had broken something. Every one of the
three mistakes above is a *verification* failure, not a *capability* failure. The model could write
the CSS and could write the test; it could not notice that the two disagreed, because noticing
requires looking at the result rather than at the diff. My job during this build was less "review
the code" and more "look at the product".

**A useful discipline that emerged:** when a claim can be measured, measure it instead of asserting
it. The duplicate-affordance bug was invisible in a diff and obvious in a screenshot. The empty
brand icons — a component fell through to a line-icon branch for four of six channels, drawing
nothing — looked *nearly* right in a screenshot and were unmissable when I asked the DOM how long
each SVG path was. `pathLen: 0` is not a matter of taste.

## Translation, because an emergency card should speak the language of the person holding it

The interface now exists in English, Spanish, French, Simplified Chinese and Russian, and adding a
sixth is a three-file pull request. `MessageKey` is derived from the English file, every other
language is typed `Record<MessageKey, string>`, and a missing key is a compile error that names the
key. Placeholders are `{name}` and `{count}`, never string concatenation, because word order is not
universal. `pnpm i18n:report` prints coverage per language so a translator working on a partial file
can see where they are.

**What the translation cost, corrected.** My first version of this post said the five-language batch
cost "under two cents". It did not: my cost report priced every session with DeepSeek's rate table,
and those four runs went out over OpenRouter on Claude Sonnet 5 at twenty times the rate. The batch
cost **$0.375**. I re-ran the Spanish half on the cheap route with the identical prompt to see
whether the premium bought anything: 100 of 145 strings came back byte-identical, and the 44
differences were stylistic rather than fixes. That is a real result — premium models buy polish, not
correctness, on mechanical bulk — and it is also a lesson about tooling, because the number that
misled me was produced by my own script and looked authoritative.

One small thing I enjoyed: the test that rejects untranslated leftovers matched *any* string
starting with the letters "TODO", which failed Spanish "Todo listo" — "all ready". A translation
gate that blocks correct copy is a bug in the gate, so it now matches marker tokens rather than
letter prefixes.

## What is honest about the state of it

Nothing is deployed. The rate limiter is built and not yet wired to the PIN endpoint — the one open
security gap, and it is written down in the README rather than hidden. The print pipeline produces a
preview image, not yet a print-ready sheet. Three things need my own hands: an OAuth client, a
sending domain, and the public card origin.

The legal pages are English only, on purpose. A machine-assisted translation of a privacy policy is
worse than a clearly English one, and someone's actual lawyer is the right contributor for those.

## The honest summary

A day of AI-assisted work produced a real application with real tests, and three embarrassing
mistakes that all came from the same root: trusting my own reading of a diff over the behaviour of
the page. If you take one thing from this, take the cheap habit — take the screenshot, then *look*
at it. Or better: measure the thing you care about, in the suite, so the next person cannot ship the
regression either.

*Built with DeepSeek V4.1 Flash in DeepSeek Harness, with translations and two end-of-day reviews
delegated to Claude Sonnet 5 and GPT-5.6 Sol over OpenRouter. Code at
[github.com/krisztianhadi/noka](https://github.com/krisztianhadi/noka), MIT licensed. Cost: roughly
three dollars on DeepSeek for the build, plus about a dollar on OpenRouter for the translations and
the reviews — of which the reviews were the better dollar.*
