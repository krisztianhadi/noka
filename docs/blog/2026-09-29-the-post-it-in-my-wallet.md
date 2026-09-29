---
title: The post-it in my wallet
date: 2026-09-29 12:00:00 +0700
---

<!--
DRAFT — not published. To ship it in txt.krisztian.wtf:
  cp this file to _posts/2026-09-29-the-post-it-in-my-wallet.md
  node tools/gen-og.mjs, then rebuild for localhost:4000 review.
Written by the agent from docs/blog/DEVLOG.md in your register, not your words.
Cut anything that isn't true in your voice, especially the last paragraph.
-->

There is a post-it in my wallet with two phone numbers on it. Ballpoint, folded once, slightly furry at the edges.

That is the competition. It needs no battery, no account, no server, and it has never leaked anything. Anything I build in this space has to be worth more than a piece of yellow paper that already works.

What the paper cannot do: carry twelve numbers. Be read by someone who does not read Hungarian. Be updated when a number changes. And — this is the one that keeps me up — it does not help at all if it is sitting in a wallet that someone has just handed to a paramedic who cannot read my handwriting.

So the product is small. A card the size of a bank card, with a QR code and a six-digit PIN printed on it. Scan, type the PIN, get the people to call: a name, a relation, and two big buttons, Call and WhatsApp. No app, no JavaScript on that page, no trackers, nothing that needs a fast connection.

The constraint I designed for is a stranger with ten seconds and a phone that is nearly out of battery. Everything else follows from that sentence.

## The honest part

The QR carries a random 128-bit slug. The PIN sits right next to it. If someone photographs the card, they have one half and only need the other.

I am not going to pretend that is two-factor authentication, because it is one factor plus a secret, printed on the same piece of plastic. What makes the secret worth anything is the rate limiter — and it is not built yet. Right now a script could sit there and walk six digits. That is the next thing I do.

> Yes, I know. Anyone holding the card who knows the PIN can read the contacts. That is the product, not a bug.

The thing I actually defend is different, and it is not the PIN. The names, numbers and notes are encrypted in the application, and the key lives in the environment — never in the database. A stolen dump, a stolen backup, a bored DBA: ciphertext. That property holds no matter how good or bad the PIN is, and it is the one I would put in front of a room.

The original spec wanted pgcrypto, encryption inside Postgres. I dropped it. A per-row key derivation in the database lands on the hot path of a page that has to render in about a second on a village connection, and it makes the key something the database knows. Doing it in the application costs microseconds and keeps the key where a dump cannot reach it. That decision is written down as ADR-003, next to the ones I got wrong.

## What the tests caught, and the demo would not have

Three bugs, and I would have shipped all three if I had been showing the thing off instead of testing it.

The first one is boring: a POST with an empty body returned a 500. `request.formData()` throws when the content type is not a form. A bot would have found it before a person did.

The second one is my favourite. The PIN page rendered its language buttons only when the card existed. So a made-up URL produced a page that was identical in every respect — except slightly shorter. An attacker does not need an error message. A layout difference is enough to learn whether a card exists. Two lines of fix, one test that compares the two responses byte for byte.

The third one hurt because it would have failed in the field, not in a lab: the framework's built-in cross-origin protection rejected the guest form whenever the browser did not send an `Origin` header, which some in-app browsers do not. A responder would have seen a 403 while standing there holding the card. The guest page now depends on no header at all.

None of that is glamorous. It is also the difference between a demo and something I would let a friend rely on.

## The machine typed, I decided

The specification, the decisions and the review are mine. The implementation was written in pair with DeepSeek V4.1 Flash in DeepSeek Harness — commit by commit, with the ADRs recording why each call went the way it did and the devlog recording what broke. Hand-written and AI-enhanced, in that order.

Is that the interesting story? Maybe not. But a portfolio that pretends otherwise is worth less than one that shows how the work actually happens now.

## What done looks like

Not ten thousand users. Ten people with a card in their wallet, and one of them posting a photo of it.

The post-it in my wallet took me ten seconds to write and it has never failed me. This thing took a day, it is not finished, and it will not be finished until someone prints it, scans it on a real phone in bad light, and calls their wife.
