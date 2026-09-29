# Why I built noka

*Draft — assembled by the agent from [DEVLOG.md](DEVLOG.md). Read it, cut what is
not true in your voice, confirm the model string, and check any number you did
not verify yourself before publishing.*

---

There is a post-it note in my wallet. It has two phone numbers on it, written in
ballpoint, folded once. If something happens to me, someone will eventually find
it, and if they can read my handwriting they can call my wife.

That note is the competition. It needs no battery, no account, no server, and it
has never leaked anything. Everything I built over the last day has to be
measured against it.

What it cannot do is carry twelve numbers, or be read by someone who does not
read Hungarian, or be updated when a number changes. So the product is small and
specific: a card the size of a bank card, with a QR code and a six-digit PIN
printed on it. Scan it, type the PIN, and you get the people to call — name,
relation, and two large buttons, *Call* and *WhatsApp*. No app, no JavaScript on
that page, no trackers, nothing that needs a fast connection.

## The two problems that are actually hard

The first is the ten seconds. Someone is standing in the street with a phone
that is nearly flat, holding a card that belongs to a stranger. The page has to
load on a bad connection, in their language, with buttons big enough for cold
hands. That is why the responder page carries no fonts, no images and no scripts,
renders in a single request, and speaks the same five languages the card is
printed in — the card cannot be printed in a language its own page cannot speak.

The second problem is the one that decides whether the idea is decent: the card
is the credential. The QR code carries a 128-bit random slug, and the PIN sits
next to it. If someone photographs the card, they have one half and need only the
other.

I will not pretend that is two-factor authentication. It is one factor plus a
secret, printed on the same piece of plastic. What makes the secret worth
anything is the rate limiter, which is the piece I have not built yet — it is the
next thing, and until it exists a scripted attacker can walk six digits. With it,
the plan's arithmetic is about four or five guesses per card per week, which is
roughly 3,800 years to exhaust the space. Rotating IP addresses does not help,
because the counter belongs to the card, not the network.

## Where the real boundary is

The thing I keep coming back to is that the PIN is not what protects the data.

The contact names, numbers and notes are encrypted in the application with
AES-256-GCM, and the key lives in the environment, never in the database. A
stolen dump, a stolen backup, or read access to Postgres yields ciphertext. That
is true no matter how good or bad the PIN is, and it is the property I would
actually defend.

The original spec asked for `pgcrypto` — encryption inside Postgres. I dropped
it: a per-row key derivation on the hot path breaks the budget of a page that has
to load in a second on a village connection, and it makes the key something the
database knows. Doing it in the application costs microseconds and keeps the key
somewhere the dump cannot reach. That decision is written down as ADR-003,
along with the ones I got wrong.

## What the tests caught that a demo would not

Three bugs, and I would have shipped all three if I had been showing the thing
off instead of testing it.

The first: a POST with no body returned a 500. `request.formData()` throws when
the content type is not a form — a bot or a scanner would have found it long
before a person did.

The second is my favourite. The PIN page rendered its language switcher only when
the card existed. That meant an unknown URL produced a page that was, in every
other respect, identical but measurably shorter. An attacker does not need an
error message to learn whether a card exists; a layout difference is enough. The
fix is that the switcher now renders the default languages when there is no card,
and a test compares the two responses byte for byte.

The third: the framework's built-in cross-origin protection rejected the guest
form whenever the browser omitted the `Origin` header, which in-app browsers
sometimes do. A responder would have seen a 403 while holding the card. The guest
plane now has no dependency on a header, and the owner plane keeps its own
origin checks on every state-changing request.

None of that is glamorous. It is also the difference between a demo and something
I would let a friend rely on.

## Being honest about the state

The journey works end to end on my machine: sign up, build a card, add encrypted
contacts, switch it on, then open the card URL and type the PIN. It is not
deployed, nothing is printed, and the rate limiter is still missing.

There are 149 unit and integration tests and 19 browser tests, including one
where a stranger in a separate browser session gets nothing without the PIN and
everything with it. The PDFs for the printed card are byte-identical between
renders, which sounds like a detail until you promise someone a reprint.

The goal is not 10,000 users. It is ten people with a card in their wallet, one
of whom posts a photo. That is the moment the idea stops being a post-it I drew
and starts being a thing that works.

The specification, the decisions and the review are mine; the implementation was
written in pair with DeepSeek V4.1 Flash in DeepSeek Harness. The commit history,
the ADRs and the development log show which parts came from where.
