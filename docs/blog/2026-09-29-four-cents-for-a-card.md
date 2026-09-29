---
title: Four cents for a card
date: 2026-09-29 18:00:00 +0700
---

<!--
DRAFT — not published. To ship it in txt.krisztian.wtf:
  cp this file to _posts/2026-09-29-four-cents-for-a-card.md
  node tools/gen-og.mjs, then rebuild for localhost:4000 review.
Written by the agent from docs/COSTS.md, which is generated from the harness's own
session logs. Every number here is this project's; nothing is combined with any
other project's spend, because those logs no longer exist.
The webchat suggested a job-hunt framing for this piece — I left it out, that part
is yours to add or leave out.
-->

There are two ways people talk about building with AI right now. One is the
screenshot of a dashboard: fifty thousand dollars of MRR, built in a weekend, the
model did everything, no notes. The other is a guy explaining that AI is useless
and you should go learn Rust.

Both skip the same thing: what it actually costs, and what you do about it.

So I measured mine. Every token this project consumed is in the harness's session
logs, and everything I paid for comes to **$1.36**. For one product, from an empty
directory to a working end-to-end flow with a hundred and forty-nine tests.

But the total is not the interesting part. The per-feature split is.

## Where the money goes

- Setting up the spec, the plan and the docs: **$0.20**
- The scaffold — framework, database, schema, encryption: **$0.17**
- Accounts and login: **$0.10**
- The card itself: its PIN, its rotation, its activation: **$0.04**
- Contacts, notes, the languages each contact speaks: **$0.09**
- The emergency page a stranger reads after scanning the card: **$0.21**
- And then the hard parts — the rate limiter, byte-identical PDFs, the container:
  **$0.54**

Four cents for the card. Fifty-four for the spikes. That is the whole lesson in
two numbers, and it is not the lesson I expected.

The cheap work was work where the problem was mine. A data model. A state machine.
A form and a page. I know how long those take because I have been writing them for
twenty-five years, and the model mostly typed while I decided things.

The expensive work was archaeology. To make a printed card reproducible byte for
byte I had to find out how the PDF library generates its file ID, whether its font
subsetter is deterministic, and that a CJK font collection cannot be subset at
all. To make a rate limiter atomic I had to read its SQL and discover that its
counter counts attempts rather than allowances. None of that was thinking. All of
it was reading someone else's code carefully enough not to be wrong about it, and
that is where a dollar goes.

## The cheapest money I ever wasted

I did the day's work between 15:20 and 17:20 local time, which sits exactly inside
the provider's peak window — so I paid **double** for every token, out of nothing
but impatience.

Off-peak is half price, weekends are off-peak all day, and an agent run is never
urgent. Half of that $1.36 was avoidable by starting two hours later. There is no
clever optimisation in this post that beats "run it after five".

## The split nobody names

The single most useful thing I did was stop treating "using AI" as one activity.

Thinking is free. The brainstorming, the specification, the plan, the arguments
with myself about whether a PIN counts as a second factor — all of that happened
in the free webchat, with no meter running. That is where the decisions came from.

Writing is paid. Every file edit, test run, migration and `docker build` went
through the API-backed harness, and that is the only part in the ledger. It also
happens to be the part a machine is unambiguously good at.

Once you see it that way the workflow designs itself: think in the free lane,
execute in the paid one, and stop trying to economise on the part that is already
free.

> Nobody would ask me what my text editor costs per hour. Inference is the first
> tool where the meter is visible per action, and that is disorienting — but it is
> also an advantage, if you look at the numbers instead of the vibe.

## What I stopped doing

**I stopped delegating for the sake of it.** Not one subtask went to a second
model. Fan-out sounds efficient until you notice you pay full price to
re-establish the same context in a fresh model, then pay again to read its
summary. Delegation is for a hundred mechanical file operations, and I did not
have a hundred of anything.

**I stopped measuring in tokens.** Tokens are an input, not an outcome. Over a
hundred million of them sounds enormous until you see that almost all were cache
reads at a third of a cent per million, and the whole day cost less than lunch.
What I want to know is cost per shipped artifact.

**I stopped guessing and started sampling.** An estimate from a rate table is fine
for steering and useless for accounting, so I sample the provider balance before
and after each block of work. The difference is what was actually deducted. Two
numbers, no arithmetic, no argument.

## And what the discipline does not fix

I wrote the database schema before reading the auth library's actual requirements.
It wanted a plaintext email column and I had designed around not having one, so a
decision had to be reversed after the fact. Two minutes of reading would have
saved an hour of unpicking, and no amount of cost tracking notices that, because
the mistake was cheap in dollars and expensive in the only budget that runs out.

I also left the emergency page's PIN endpoint without a rate limiter while I built
the spikes, because the plan said that came next. The plan was right and it still
felt wrong for the whole hour.

## The framing, since it matters

I am not doing this because I cannot afford to vibecode. I am doing it because
cost per shipped artifact is a number I can move, and because a budget line nobody
looks at is how a cheap habit turns into a surprising invoice.

One product. A dollar thirty-six. The interesting part was never the total — it
was learning that four cents buys a card and fifty-four buys the knowledge that
you were wrong about a font.
