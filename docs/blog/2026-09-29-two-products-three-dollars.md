---
title: Two products, three dollars
date: 2026-09-29 18:00:00 +0700
---

<!--
DRAFT — not published. To ship it in txt.krisztian.wtf:
  cp this file to _posts/2026-09-29-two-products-three-dollars.md
  node tools/gen-og.mjs, then rebuild for localhost:4000 review.
Written by the agent from docs/COSTS.md and the devlog. Every number comes from
scripts/usage-report.mjs, which reads the harness's own session logs.
The webchat suggested the job-hunt framing ("how I built two products on a
job-hunt budget") — I left it out because that is yours to add or leave out.
-->

There are two ways people talk about building with AI right now. One is the
screenshot of a dashboard: fifty thousand dollars of MRR, built in a weekend, the
model did everything, no notes. The other is a guy explaining that AI is useless
and you should go learn Rust.

Both are unhelpful, and both skip the same thing: what it actually costs, and what
you do about it. So here are my numbers.

I built two products in the last two weeks. Everything I paid for, measured from
the session logs rather than remembered, comes to **$2.93**. One of those
projects is deliberately trivial and one of them is not, and the expensive one
cost a dollar thirty.

## The split nobody names

The single most useful thing I did was stop treating "using AI" as one activity.

Thinking is free. The brainstorming, the specification, the plan, the arguments
with myself about whether a PIN is a factor or a secret — all of it happened in
the free webchat, which costs nothing and has no meter running. That is where the
decisions came from.

Writing is paid. Every file edit, every test run, every migration, every
`docker build` went through the API-backed harness, and that is the only part
that appears in my ledger. It also happens to be the part a machine is
unambiguously good at.

Once you see it that way, the workflow designs itself. I think in the free lane
and I execute in the paid lane, and I stop feeling like I should economise on the
part that is already free.

## Where the money actually goes

Here is the breakdown per piece of work, from the logs:

- The contract, the plan and the docs: **$0.20**
- The scaffold — Astro, the database, the schema, the encryption module: **$0.17**
- Accounts, login, sessions: **$0.10**
- The card itself, with its PIN, rotation and activation: **$0.04**
- Contacts, notes, the languages a contact speaks: **$0.09**
- The emergency page a stranger reads after scanning: **$0.21**
- Closing the hard technical spikes — rate limiter store, PDF determinism,
  container: **$0.45**

Four cents for the card. Forty-five for the spikes. That is the whole lesson in
two numbers, and it is not the lesson I expected.

The cheap work was work where the problem was mine: a data model, a state
machine, a form, a page. I know how long those take because I have been writing
them for twenty-five years, and the model mostly typed while I decided.

The expensive work was archaeology. To make the printed card reproducible byte for
byte I had to find out how the PDF library generates its file ID, whether its font
subsetter is deterministic, and that a CJK font collection cannot be subset at
all. To make the rate limiter atomic I had to read a library's SQL and discover
that its counter counts attempts rather than allowances. None of that was
thinking. All of it was reading someone else's code carefully enough not to be
wrong about it, and that is where a dollar goes.

## The cheapest money I ever wasted

I did the whole day's work between 15:20 and 17:20 local time, which turns out to
sit exactly inside the provider's peak window — so I paid double for every token,
out of nothing but impatience.

Half of that $1.27 was avoidable by starting two hours later. Off-peak is half
price, weekends are off-peak all day, and long agent runs are not urgent. There
is no clever optimisation in this post that beats "run it after five".

## What I stopped doing

**I stopped delegating for the sake of it.** Not one subtask went to a second
model in either project. Fan-out sounds efficient until you notice you pay full
price to re-establish the same context in a fresh model, and then pay again to
read its summary. Delegation is for a hundred mechanical file operations, which I
did not have. The cheap inference was free anyway — it was the *thinking* lane.

**I stopped measuring in tokens.** Tokens are an input, not an outcome. A
hundred million of them sounds like a lot until you see that 96% were cache reads
at a third of a cent per million, and the whole thing cost less than lunch. What I
want to know is cost per shipped artifact, and that is a different number.

**I stopped guessing and started sampling.** Estimates from a rate table are fine
for steering and useless for accounting, so I sample the provider balance before
and after a block of work. The difference is what was actually deducted. Two
numbers, no arithmetic, no argument.

## And an honest list of what that discipline does not fix

I wrote the database schema before reading the auth library's actual
requirements. It wanted a plaintext email column and I had designed around not
having one, so a decision got reversed after the fact. Two minutes of reading
would have saved an hour of unpicking, and no amount of cost tracking notices
that — the mistake was cheap in dollars and expensive in the only budget that
runs out.

I also left the emergency page's PIN endpoint without a rate limiter while I built
the spikes, because the plan said that came next. The plan was right and it still
felt wrong the whole time I was doing it.

## The framing, since it matters

I am not doing this because I cannot afford to vibecode. I am doing it because
cost per shipped artifact is a number I can move, and because a budget line you
never look at is how a "cheap" habit turns into a surprising invoice.

Two products. Three dollars. The interesting part was not the total — it was
learning that four cents buys a card and forty-five buys the knowledge that you
were wrong about a font.
