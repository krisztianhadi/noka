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
| Session (UTC) | Local (+07) | Route | Turns | Cache-miss in | Cache-hit in | Output | Peak | Off-peak | Est. USD |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-09-29 08:20Z → 16:43Z (c9b83d6c) | 2026-09-29 15:20+07 | deepseek-flash | 1925 | 5,183,787 | 744,915,712 | 1,339,605 | $2.1820 | $2.7251 | $4.9071 |
| 2026-09-29 08:30Z → 08:31Z (fa4ae818) | 2026-09-29 15:30+07 | deepseek-flash | 4 | 31,361 | 49,792 | 4,493 | $0.0151 | $0.0000 | $0.0151 |
| 2026-09-29 08:38Z → 08:38Z (5824641c) | 2026-09-29 15:38+07 | deepseek-flash | 2 | 14,740 | 14,208 | 5,334 | $0.0109 | $0.0000 | $0.0109 |
| 2026-09-29 09:16Z → 09:16Z (be9fe88c) | 2026-09-29 16:16+07 | deepseek-flash | 2 | 15,568 | 13,824 | 596 | $0.0055 | $0.0000 | $0.0055 |
| 2026-09-29 10:00Z → 10:00Z (0cc33cd9) | 2026-09-29 17:00+07 | deepseek-flash | 1 | 5,704 | 128 | 4,108 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-29 10:01Z → 10:01Z (967dd579) | 2026-09-29 17:01+07 | deepseek-flash | 2 | 15,149 | 14,336 | 2,107 | $0.0000 | $0.0036 | $0.0036 |
| 2026-09-29 10:09Z → 10:09Z (14dc1a86) | 2026-09-29 17:09+07 | deepseek-flash | 3 | 30,974 | 31,232 | 2,893 | $0.0000 | $0.0065 | $0.0065 |
| 2026-09-29 10:21Z → 10:21Z (4762b4ef) | 2026-09-29 17:21+07 | deepseek-flash | 3 | 32,367 | 34,048 | 3,458 | $0.0000 | $0.0070 | $0.0070 |
| 2026-09-29 10:28Z → 10:28Z (5b9c7522) | 2026-09-29 17:28+07 | deepseek-flash | 4 | 31,527 | 50,816 | 4,291 | $0.0000 | $0.0075 | $0.0075 |
| 2026-09-29 10:57Z → 10:57Z (5fe5cb5e) | 2026-09-29 17:57+07 | deepseek-flash | 3 | 31,106 | 32,768 | 4,171 | $0.0000 | $0.0073 | $0.0073 |
| 2026-09-29 11:25Z → 11:25Z (18869cd8) | 2026-09-29 18:25+07 | deepseek-flash | 3 | 31,223 | 32,768 | 3,627 | $0.0000 | $0.0070 | $0.0070 |
| 2026-09-29 12:27Z → 12:27Z (21f1faef) | 2026-09-29 19:27+07 | deepseek-flash | 4 | 32,205 | 71,680 | 5,039 | $0.0000 | $0.0081 | $0.0081 |
| 2026-09-29 12:50Z → 12:50Z (4fee3188) | 2026-09-29 19:50+07 | deepseek-flash | 3 | 15,366 | 32,896 | 3,746 | $0.0000 | $0.0047 | $0.0047 |
| 2026-09-29 13:00Z → 13:00Z (9f0c9e79) | 2026-09-29 20:00+07 | deepseek-flash | 3 | 31,830 | 31,360 | 2,577 | $0.0000 | $0.0064 | $0.0064 |
| 2026-09-29 13:10Z → 13:10Z (f86c360d) | 2026-09-29 20:10+07 | deepseek-flash | 3 | 31,459 | 33,408 | 3,631 | $0.0000 | $0.0070 | $0.0070 |
| 2026-09-29 13:17Z → 13:17Z (3f5494e6) | 2026-09-29 20:17+07 | deepseek-flash | 3 | 31,076 | 30,208 | 2,467 | $0.0000 | $0.0062 | $0.0062 |
| 2026-09-29 13:28Z → 13:28Z (0cb81499) | 2026-09-29 20:28+07 | deepseek-flash | 3 | 31,625 | 30,976 | 2,476 | $0.0000 | $0.0063 | $0.0063 |
| 2026-09-29 13:37Z → 13:37Z (f61b59d6) | 2026-09-29 20:37+07 | deepseek-flash | 3 | 31,897 | 32,000 | 2,852 | $0.0000 | $0.0066 | $0.0066 |
| 2026-09-29 13:57Z → 13:57Z (7d0b7e74) | 2026-09-29 20:57+07 | deepseek-flash | 2 | 15,285 | 13,696 | 979 | $0.0000 | $0.0029 | $0.0029 |
| 2026-09-29 14:14Z → 14:14Z (34cdfff6) | 2026-09-29 21:14+07 | deepseek-flash | 3 | 30,925 | 31,872 | 3,399 | $0.0000 | $0.0068 | $0.0068 |
| 2026-09-29 15:08Z → 15:08Z (6f4344c9) | 2026-09-29 22:08+07 | deepseek-flash | 3 | 29,912 | 29,568 | 2,273 | $0.0000 | $0.0059 | $0.0059 |
| 2026-09-29 15:20Z → 15:20Z (de6bf717) | 2026-09-29 22:20+07 | deepseek-flash | 3 | 30,356 | 30,464 | 2,794 | $0.0000 | $0.0063 | $0.0063 |
| 2026-09-29 15:28Z → 15:29Z (379dad09) | 2026-09-29 22:28+07 | claude-sonnet-5 | 6 | 12 | 146,335 | 6,097 | — | — | not priced (≈$0.0041 on DeepSeek) |
| 2026-09-29 15:28Z → 15:29Z (5472fadc) | 2026-09-29 22:28+07 | claude-sonnet-5 | 8 | 16 | 207,838 | 6,121 | — | — | not priced (≈$0.0043 on DeepSeek) |
| 2026-09-29 15:28Z → 15:29Z (fc28992e) | 2026-09-29 22:28+07 | claude-sonnet-5 | 6 | 12 | 144,459 | 5,362 | — | — | not priced (≈$0.0037 on DeepSeek) |
| 2026-09-29 15:28Z → 15:29Z (0d274ff5) | 2026-09-29 22:28+07 | claude-sonnet-5 | 7 | 14 | 180,208 | 6,334 | — | — | not priced (≈$0.0043 on DeepSeek) |
| 2026-09-29 15:35Z → 15:36Z (d13d4683) | 2026-09-29 22:35+07 | gpt-5.6-sol | 17 | 51 | 1,113,058 | 4,527 | — | — | not priced (≈$0.0061 on DeepSeek) |
| 2026-09-29 15:35Z → 15:37Z (399d8d63) | 2026-09-29 22:35+07 | claude-sonnet-5 | 19 | 38 | 1,736,513 | 9,977 | — | — | not priced (≈$0.0112 on DeepSeek) |
| 2026-09-30 01:41Z → 01:41Z (1a53b19f) | 2026-09-30 08:41+07 | deepseek-flash | 6 | 7,610 | 134,144 | 8,935 | $0.0138 | $0.0000 | $0.0138 |
| 2026-09-30 01:48Z → 01:48Z (388fd40d) | 2026-09-30 08:48+07 | deepseek-flash | 1 | 5,895 | 128 | 1,955 | $0.0041 | $0.0000 | $0.0041 |
| 2026-09-30 02:56Z → 02:57Z (287fb3ea) | 2026-09-30 09:56+07 | gpt-5.6-sol | 3 | 9 | 27,018 | 4,127 | — | — | not priced (≈$0.0051 on DeepSeek) |
| 2026-09-30 05:07Z → 05:08Z (101492d2) | 2026-09-30 12:07+07 | gpt-5.6-sol | 4 | 12 | 40,797 | 3,452 | — | — | not priced (≈$0.0022 on DeepSeek) |
| 2026-09-30 05:07Z → 05:10Z (7bd0dfd4) | 2026-09-30 12:07+07 | claude-sonnet-5 | 9 | 18 | 257,297 | 16,213 | — | — | not priced (≈$0.0105 on DeepSeek) |
| 2026-09-30 12:46Z → 12:47Z (0295e2c2) | 2026-09-30 19:46+07 | gpt-5.6-sol | 5 | 15 | 103,714 | 2,210 | — | — | not priced (≈$0.0016 on DeepSeek) |
| **Total (DeepSeek only)** | | | **1,992** | **5,748,947** | **745,692,032** | **1,417,806** | **$2.2314** | **$2.8344** | **$5.0658** |

_Estimated from the published deepseek-flash rates, peak and off-peak; generated 2026-09-30 by `node scripts/usage-report.mjs --write`._

_10 session(s) ran on another provider (they show `other` in the Route column). Their token counts are real and included; **their USD is not priced here**, because this table's rates belong to DeepSeek. On DeepSeek rates those runs would have been ≈$0.0531 — which is not what they cost. Price them from the other provider's own dashboard or its `/credits` endpoint._
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
| 08:20–08:41Z (15:20+07) | Contract, docs and the first push (pre-goal) | 65 | 5,572,918 | $0.1987 | 4% |
| 08:41–08:48Z (15:41+07) | Phase 0 spikes (partial) + Phase 1 scaffold | 59 | 11,444,916 | $0.1656 | 3% |
| 08:48–08:52Z (15:48+07) | Phase 2 — owner plane: better-auth, argon2id, dashboard | 36 | 9,522,992 | $0.0983 | 2% |
| 08:52–08:55Z (15:52+07) | Phase 3 — the card: PIN, rotation, activation | 17 | 5,036,787 | $0.0553 | 1% |
| 08:55–08:59Z (15:55+07) | Phase 4 — contacts, notes, spoken languages | 26 | 8,514,014 | $0.0910 | 2% |
| 08:59–09:08Z (15:59+07) | Phase 5 — the responder page | 62 | 23,765,324 | $0.2134 | 4% |
| 09:08–16:43Z (16:08+07) | Spikes closed + day two: footer, legal pages, self-service export/deletion, retention purge, full i18n | 1660 | 687,582,153 | $4.0847 | 83% |
| **Total** | | **1,925** | **751,439,104** | **$4.9071** | |

_Attributed by goal-round boundaries in the main session (c9b83d6c); the short side sessions add $0.1587 more._
<!-- blocks:end -->

Read that table the way it was meant: **the card cost 4 cents to build and the
responder page cost 21.** The two cheapest blocks are the two most self-contained
ones — a schema plus a state machine, a form plus a render. The expensive ones are
where the work was *archaeology*: reading a library's real schema before trusting
it (Phase 2), and closing the Phase 0 spikes, which meant a container build, a
font pipeline, and discovering that a hand-rolled PDF has to be made
byte-deterministic on purpose. Roughly: cheap where the problem was mine,
expensive where the problem was someone else's code.

The last row is the whole of day two — the interface in five languages, self-service
export and deletion, the retention purge, the footer and the legal pages — and it dwarfs
everything before it. Part of that is real work; part of it is a long interactive session
that was never restarted, so its cache-hit input is enormous and its price is dominated by
context that was re-read rather than re-derived. The lesson for the next build: **restart
the session at a phase boundary**, because a fresh context is cheaper than a familiar one.

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
- **Fan-out arrived on day two, and I mispriced it.** Everything up to the first
  phase was one model in one context. The five-language translation was the first
  genuine fan-out: four subagents, one per language, each given the English key set
  and the existing responder strings as the terminology reference, all running at
  once.
- **Two providers, and the estimate only covers one of them.** The build runs on
  `deepseek-flash`. The translation batch and the two end-of-day reviews went out
  over OpenRouter. The earlier version of this file priced *everything* with
  DeepSeek's rate table and told the story of "a five-language owner plane for under
  two cents". That was wrong by roughly a factor of twenty: those sessions ran on
  Claude Sonnet 5 at $2 / $10 per million tokens.

  | Batch | Tokens (in / cached / out) | Actual at the route's rates | On deepseek-chat |
  |---|---|---:|---:|
  | es / fr / zh / ru translation | 54 in-cache-miss, 678,840 cached, 23,914 out | **$0.375** | ≈$0.050 |
  | Claude review | 1,736,513 cached, 9,977 out | **$0.715** | ≈$0.059 |
  | GPT-5.6 Sol review | 1,113,058 cached, 4,527 out | (included above) | ≈$0.036 |

  The Route column in the usage table now says which model each session ran on, and
  anything that is not DeepSeek is left **unpriced** rather than under-priced: the
  table shows the DeepSeek-rate equivalent in brackets, clearly labelled as not the
  bill.

- **Was the expensive translation route worth 7.5×?** Tested, rather than argued:
  the same Spanish batch was re-run on `deepseek-flash` with the identical prompt. 100
  of 145 strings came back byte-identical; the 44 differences were stylistic — "quien
  te ayuda" against "quien te auxilie", "Actualizar correo electrónico" against
  "Actualizar correo". Both passed every mechanical gate (parity, placeholders, empty
  values, destructive wording). So the premium bought polish, not correctness, and
  the honest split is a cheap first pass plus a careful read of the handful of strings
  where wording is a safety property — not four premium agents for mechanical bulk.
- **Review is where the money was worth it.** Two independent reviews cost ≈$0.72 and
  found a shipped bug (a text-only contact's number was still a dialler) plus five
  non-transactional write paths. `$0.36` per review for that is the cheapest thing in
  this file. Neither model's opinion was treated as a finding until the claim could be
  checked against the code.

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

## One project, one file

`docs/COSTS.md` covers **noka only**. The script never reads another workspace's
logs, and there is no cross-project total anywhere in this file.

That is not tidiness, it is accuracy. Session logs get lost — a month of work on a
sibling project left no logs at all, so its true spend is unknown and any combined
figure would silently under-report both projects. An honest per-project number
beats a wrong aggregate.

The same reasoning applies inside this file: OpenRouter's per-account `total_usage`
is **not** a noka number, because that account has served other work. Only the two
DeepSeek balance samples above are measured; every OpenRouter figure here is the
provider's published rates applied to token counts from the harness log, and it is
labelled as an estimate accordingly.

The method is packaged as the `project-costs` skill, so every project gets the same
file, the same script and the same rules, with its own ledger.

## Balance ledger (actual USD)

<!-- ledger:start -->
| Recorded (UTC) | Balance | Change | Note |
|---|---:|---:|---|
| 2026-09-29 10:15Z | $28.97 | — | ledger opened — work up to here is estimated, not measured |
| 2026-09-29 15:35Z | $27.24 | −$1.7300 | footer, self-service data, full i18n |
| 2026-09-30 16:43Z | $23.28 | −$3.9600 | day two: landing, dashboard and card design passes, PDF generator |

**Actually spent across 2026-09-29 10:15Z → 2026-09-30 16:43Z: $5.69** — this is the provider's own arithmetic.
<!-- ledger:end -->

The ledger is sampled before and after a block of work —
`node scripts/usage-report.mjs --balance "note"` — because the provider exposes a
balance endpoint but no per-day spend endpoint. The difference between two samples
is what was actually deducted, which beats any estimate built from token counts
and a rate table.

The baseline sample is dated today, so everything above it was **not yet measured**
when the ledger opened: those rows are estimates and will stay estimates.
Everything after the last row is measured.

## Refreshing this file

```sh
node scripts/usage-report.mjs                              # print everything
node scripts/usage-report.mjs --write                      # refresh the three blocks
node scripts/usage-report.mjs --balance "end of phase 6"   # sample the balance, then --write
```

## What this file is not

- Not a budget. There is no cap in place; this records, it does not brake.
- Not a forecast. A phase that goes smoothly costs less than one that fights
  someone else's framework, and so far the second kind has been the norm.
- Not the whole picture of effort. The free lane carries the thinking, and the
  thinking is what decides whether the code was worth writing.
