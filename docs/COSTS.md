# What building this costs

Three lanes, and only one of them has a price.

| Lane | What it is for | Cost |
|---|---|---|
| DeepSeek webchat (free tier) | Brainstorming, the specification, the plan, thinking out loud | **$0** — it is the free chat, not the API |
| DeepSeek API via this harness | Writing the code, the tests, the docs, running the build | **Usage-based**, billed by the provider |
| Infrastructure | Postgres, hosting | **Nothing yet** — nothing is deployed |

Most side projects have no idea what they cost, and "it felt cheap" is not a
number. So this file keeps three answers, in increasing order of truthfulness:

1. **Tokens** — exact, read from the harness's own session logs.
2. **An estimate in USD** — the published rates applied to those tokens, split by
   the provider's peak window.
3. **Actual USD** — the provider's balance, sampled and differenced. The only
   number that is money rather than arithmetic.

## Usage and estimate

Every request the harness makes is logged with a timestamp and a usage object, so
the figures below are read rather than remembered:
`~/.dsh/sessions/--home-k-Code-noka--/*/session.v4.jsonl.zstd`.

<!-- usage:start -->
| Session (UTC) | Local (+07) | Turns | Cache-miss in | Cache-hit in | Output | Peak | Off-peak | Est. USD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-09-29 08:20Z → 10:20Z (c9b83d6c) | 2026-09-29 15:20+07 | 418 | 414,328 | 139,737,088 | 410,791 | $1.1112 | $0.1723 | $1.2834 |
| 2026-09-29 08:30Z → 08:31Z (fa4ae818) | 2026-09-29 15:30+07 | 4 | 31,361 | 49,792 | 4,493 | $0.0151 | $0.0000 | $0.0151 |
| 2026-09-29 08:38Z → 08:38Z (5824641c) | 2026-09-29 15:38+07 | 2 | 14,740 | 14,208 | 5,334 | $0.0109 | $0.0000 | $0.0109 |
| 2026-09-29 09:16Z → 09:16Z (be9fe88c) | 2026-09-29 16:16+07 | 2 | 15,568 | 13,824 | 596 | $0.0055 | $0.0000 | $0.0055 |
| 2026-09-29 10:00Z → 10:00Z (0cc33cd9) | 2026-09-29 17:00+07 | 1 | 5,704 | 128 | 4,108 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-29 10:01Z → 10:01Z (967dd579) | 2026-09-29 17:01+07 | 2 | 15,149 | 14,336 | 2,107 | $0.0000 | $0.0036 | $0.0036 |
| 2026-09-29 10:09Z → 10:09Z (14dc1a86) | 2026-09-29 17:09+07 | 3 | 30,974 | 31,232 | 2,893 | $0.0000 | $0.0065 | $0.0065 |
| **Total** | | **432** | **527,824** | **139,860,608** | **430,322** | **$1.1426** | **$0.1856** | **$1.3283** |

_Estimated from the published deepseek-flash rates, peak and off-peak; generated 2026-09-29 by `node scripts/usage-report.mjs --write`._
<!-- usage:end -->

**How the estimate is built.** Rates are `deepseek-flash` per 1M tokens, from
<https://api-docs.deepseek.com/quick_start/pricing>: cache-hit input $0.003
off-peak / $0.006 peak, cache-miss input $0.15 / $0.30, output $0.60 / $1.20.
Off-peak is exactly half of peak, and the split matters — see below.

Two assumptions, stated so they can be wrong out loud: cache-miss input is taken
to be the usage field `inputTokens` and cache-hit input `cacheReadTokens`; and
Chinese public holidays are not modelled, so a holiday weekday is charged at peak
rates. The error is on the safe side.

## Cost per feature

<!-- blocks:start -->
| Block | What it built | Turns | Tokens | Est. USD | Share |
|---|---|---:|---:|---:|---:|
| 08:20–08:41Z (15:20+07) | Contract, docs and the first push (pre-goal) | 65 | 5,572,918 | $0.1987 | 15% |
| 08:41–08:48Z (15:41+07) | Phase 0 spikes (partial) + Phase 1 scaffold | 59 | 11,444,916 | $0.1656 | 13% |
| 08:48–08:52Z (15:48+07) | Phase 2 — owner plane: better-auth, argon2id, dashboard | 36 | 9,522,992 | $0.0983 | 8% |
| 08:52–08:55Z (15:52+07) | Phase 3 — the card: PIN, rotation, activation | 17 | 5,036,787 | $0.0553 | 4% |
| 08:55–08:59Z (15:55+07) | Phase 4 — contacts, notes, spoken languages | 26 | 8,514,014 | $0.0910 | 7% |
| 08:59–09:08Z (15:59+07) | Phase 5 — the responder page | 62 | 23,765,324 | $0.2134 | 17% |
| 09:08–10:20Z (16:08+07) | Phase 0 spikes closed (limiter, PDF, container) + docs, licence, policy, costs | 153 | 76,705,256 | $0.4610 | 36% |
| **Total** | | **418** | **140,562,207** | **$1.2834** | |

_Attributed by goal-round boundaries in the main session (c9b83d6c); the short side sessions add $0.0449 more._
<!-- blocks:end -->

Read that table the way it was meant: **the card cost 4 cents to build and the
responder page cost 21.** The two cheapest blocks are the two most self-contained
ones — a schema plus a state machine, a form plus a render. The expensive ones are
where the work was *archaeology*: reading a library's real schema before trusting
it (Phase 2), and closing the Phase 0 spikes, which meant a container build, a
font pipeline, and discovering that a hand-rolled PDF has to be made
byte-deterministic on purpose. Roughly: cheap where the problem was mine,
expensive where the problem was someone else's code.

Attribution is by goal-round boundary in the session log — the only signal the
harness records. The mapping from each round to what it built is hand-written in
`scripts/usage-report.mjs`, deliberately: automating it would be a guess dressed
as a report.

## Peak and off-peak, in your own clock

The provider charges double inside peak hours and half outside them:

| Window | UTC | Local (+07) |
|---|---|---|
| **Peak** | 01:00–04:00 and 06:00–10:00, Mon–Fri | **08:00–11:00 and 13:00–17:00, Mon–Fri** |
| **Off-peak** | everything else, plus weekends and Chinese holidays | **after 17:00, before 08:00, and all weekend** |

This whole build ran 15:20–17:20 local, i.e. almost entirely inside peak. The
same tokens in off-peak hours would have cost **half**. Practical rule: long agent
runs after 17:00 or before 08:00, or on a Saturday; a quick interactive turn
inside peak is not worth scheduling around.

## How the work splits

- **Thinking is free.** The specification, the plan, the ADR reasoning and the
  framing of this file came out of the free webchat lane. It does not appear in
  the logs below because it does not cost anything.
- **Writing is paid.** Every file edit, test run, migration and container build
  went through the harness, and that is what the tables measure.
- **Zero subagent fan-out.** Not one delegation call in this project: the work
  was sequential and your feedback was in the loop, so handing a subtask to a
  second model would have meant paying twice to re-establish the same context.
  Delegation is for bulk mechanical sweeps; there were none.
- **One route, no model juggling.** The harness log names a single route
  (`deepseek-flash`). There is no "cheap model for grunt work, expensive model for
  review" story here — that is a gap in the experiment, not a finding, and it is
  the obvious next thing to measure.

## What I would not do again

1. **Run a long session inside peak hours.** It doubled the bill for no benefit
   whatsoever; the only thing that needed to be urgent was my own impatience.
2. **Trust a server that was already running.** The e2e suite silently tested a
   stale build and produced four failures that had nothing to do with the code.
   Now it always starts its own, on `127.0.0.1` rather than `localhost`.
3. **Write the schema before spiking the library that owns it.** better-auth
   requires a plaintext `email` column; finding that out after the schema was
   written cost a reversal (ADR-004) that a two-minute read would have prevented.
4. **Leave a safety endpoint unthrottled while building the next phase.** The
   responder page works and the PIN endpoint is not rate-limited yet. The plan
   sequenced it that way, and it is still the wrong feeling.

## The same measurement, across projects

`node scripts/usage-report.mjs --all` reads every workspace the harness has logged:

| Workspace | Sessions | Turns | Tokens | Est. USD |
|---|---:|---:|---:|---:|
| `~/Code/314` | 28 | 564 | 161,765,713 | $1.39 |
| `~/Code/noka` | 7 | 425 | 136,666,671 | $1.31 |
| `~/Code/nokard` (noka's earlier home) | 4 | 35 | 1,867,926 | $0.15 |
| `~/Code/ghosted` | 5 | 80 | 5,868,068 | $0.07 |
| **Total** | **44** | **1,104** | **306,168,378** | **$2.93** |

Two things this table is not. It is not the whole picture — it sees only this
harness, not the free webchat that carried the thinking, and not any other tool.
And it is not a bill: the only measured money is the ledger below.

## Balance ledger (actual USD)

<!-- ledger:start -->
| Recorded (UTC) | Balance | Change | Note |
|---|---:|---:|---|
| 2026-09-29 10:15Z | $28.97 | — | ledger opened — work up to here is estimated, not measured |

_Only one balance recorded so far, so there is nothing to subtract yet. Run `--balance` again after the next block of work._
<!-- ledger:end -->

The ledger is sampled by hand — `node scripts/usage-report.mjs --balance "note"` —
because the provider exposes a balance endpoint but no per-day spend endpoint. The
difference between two samples is what was actually deducted, which beats any
estimate built from token counts and a rate table.

The baseline sample is dated today, so everything above it was **not yet measured**
when the ledger opened: those rows are estimates and will stay estimates.
Everything after the last row is measured.

## Refreshing this file

```sh
node scripts/usage-report.mjs                              # print everything
node scripts/usage-report.mjs --write                      # refresh the three blocks
node scripts/usage-report.mjs --balance "end of phase 6"   # sample the balance, then --write
node scripts/usage-report.mjs --all                        # every workspace
```

## What this file is not

- Not a budget. There is no cap in place; this records, it does not brake.
- Not a forecast. A phase that goes smoothly costs less than one that fights
  someone else's framework, and so far the second kind has been the norm.
- Not the whole picture of effort. The free lane carries the thinking, and the
  thinking is what decides whether the code was worth writing.
