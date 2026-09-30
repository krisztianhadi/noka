# Five millimetres, a model without eyes, and a limit that let you past it

*A reflection on 2026-09-30: the day noka stopped being a wireframe.*

Yesterday noka was a working app that looked like a wireframe. Today it looks like a product, and
the interesting part is how the design decisions got made — because the model that reviewed the
design could not see a single pixel of it.

noka is a more elegant way to keep a handwritten note in your wallet: a card the size of a bank
card, a QR code, a six-digit PIN, and the people to call. Built with DeepSeek V4.1 Flash in DeepSeek
Harness, with two review passes from GPT-5.6 Sol and Claude Sonnet 5 on the parts where being wrong
is expensive.

## A design review from something blind

Sol cannot see a screenshot. So instead of sending an image, I measured the interface: every visible
element on the dashboard and on the card page, with its computed font size, weight, line height,
colour, background, box, margins, padding, radius, border and shadow, dumped to JSON next to the
design tokens. The brief was those files plus the constraints — which parts may use JavaScript,
which may not, and why.

It found a bug I had shipped, screenshotted, looked at, and not seen.

The card page declares the phone number at `2.5rem`. On a 390px phone it computes **30.42px**,
because I had clamped it so a monospace face would fit on one line. The contact's name — the least
actionable thing on the page — was rendered at 40px. So on the one screen where a stranger in a
hurry needs a datum, the datum was smaller than the label.

Fixing it needed a measurement rather than an opinion. A full international number in the mono face
at 40px needs 360px; a 390px phone gives you 318. The proportional face at 40px needs 306 and fits,
so the number now leads at 40px, the name steps down to 32px, and tabular figures keep the digits
aligned. The trade is real: mono disambiguates `0` from `O`, and that is exactly the kind of clarity
you want in a phone number. It costs 54 pixels of width, and the width was not there.

The lesson is not "ask a model about design". It is that a design defect and a measured
contradiction are the same event, and only one of them can be checked.

## axe as a design reviewer

The dashboard's card section used to be another white card. Now it is an ink plate — the one dark
surface on the owner plane, matching the landing page, and the reason it stopped reading as "one
more settings section".

The accessibility test failed within seconds of that change: text at `#5b6270` on `#14161a`,
**2.95:1**. Every word inside that plate needed to move to the ink plane's own colours. A palette
decision and a contrast failure are one step apart, and the step is automated.

## The layout change that broke a form field

Contacts and the card became two columns: the workflow on the left, the artifact parked sticky on
the right. What I did not check was the shell. The dashboard's container was `max-w-3xl` — 720
pixels wide — so the left column was 344px, and the phone field inside the contact form was **126
pixels wide**. On a desktop.

A browser test caught it, and only because it measured absolute edges rather than eyeballing
("every control fits inside its row"). The fix has a shape worth copying: the dashboard got a wider
shell (`max-w-5xl`, via a new prop that form pages deliberately cannot use), the two-column split
waits for `xl`, and the number field is 382px.

Then the test itself needed fixing. It compared the country select to a *fraction of an ancestor
whose width follows the page grid* — so it broke when the page gained a column, without anything
about the form changing. I re-pointed it at the two controls, which is the contract it meant. A test
that fails for the right reason is still a test whose assumption may be the broken part.

## "That number is too long" — then why do you let me type it?

His words, and he was right. There were two bugs behind that message.

The mask allowed **15 national digits regardless of the country**, but the format allows 15 digits
*total*. With `+66` that is 17 digits in a 15-digit coat, and the server — correctly — refused it.
The cap is now `15 − dial code length`, re-applied when the country changes: 13 for Thailand, 14 for
the US, and 15 for a pasted number that carries its own code.

The second bug was mine, in the fix. A static `maxlength="18"` as the no-JavaScript guard counts
spaces and the plus sign, so it silently truncated a pasted international number at **13 digits**.
The true maximum is 20 characters. I only found it because the test that was supposed to be a
formality typed nineteen digits and counted what survived.

A limit the form accepts and the server rejects is not a limit. It is a trap with a friendly label.

## Ten cards on A4, because of a division

He wanted a sheet with "whatever fits decently — 10-12 I think". Portrait cards on A4 give nine:
three across (3 × 54mm), three down. Rotate them a quarter turn and 85.6mm divides into 210mm twice
while 54mm divides into 297mm five times: **ten cards**, with an 8mm margin and a 2mm gap. At a 4mm
gap the fifth row falls off the page and you are back to eight.

The generator produces three files: the card at exactly 53.98 × 85.60 mm for a print shop, one card
centred on A4 with corner cut marks for a home printer, and the ten-card sheet. One 600dpi image is
embedded per document and drawn as many times as the layout needs — which is why the sheet is 1.06MB,
the same as the single card, rather than ten times that.

## Two stools, same leg

The mistake I made twice today: rebuilding the app while the old server was still running, then
handing over a URL. The first time he opened a page that did not have the change. The second time I
spent ten minutes debugging a form that "did not exist" — against a stale process I had started
myself.

The rule was already written down, from a worse version of the same mistake yesterday. It said
"restart what you kill". It now says: after every build, restart, then `curl` the loopback address
*and* the LAN address, and only then mention a URL. Twice is a pattern; the third time would be a
character flaw.

## What it cost

The provider's own arithmetic: **$3.96** for today, **$5.69** for the whole project. Not an estimate
from a rate table — the difference between two balance samples, which is the only number here that
is money.

The design and review runs (Sol, Claude) are on a different account that serves other work, so they
stay unpriced in the cost file rather than priced with someone else's rate table. That mistake is
already in there once, at a factor of twenty; it does not need a second entry.

## Where it stands

161 unit and integration tests, 50 browser tests, green. The landing page, the dashboard and the
card page have each had a design pass. The print masters exist. The demo page runs the real flow —
PIN, contacts, exit — so the QR code on the landing page's sample card leads somewhere that works.

Left in this phase: a no-PIN card variant behind a blunt warning, and the one test a machine cannot
run — printing the sheet, cutting it out, and scanning the QR code with three different phones.
