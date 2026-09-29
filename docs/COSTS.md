# What building this costs

Three lanes, and only one of them has a price.

| Lane | What it is for | Cost |
|---|---|---|
| DeepSeek webchat (free tier) | Brainstorming, the specification, the plan, thinking out loud | **$0** — it is the free chat, not the API |
| DeepSeek API via this harness | Writing the code, the tests, the docs, running the build | **Usage-based**, billed by the provider |
| Infrastructure | Postgres, hosting | **Nothing yet** — nothing is deployed |

Most side projects have no idea what they cost, and "it felt cheap" is not a
number. So this file keeps two answers, in increasing order of truthfulness:

1. **Tokens** — exact, read from the harness's own session logs.
2. **An estimate in USD** — the published rates applied to those tokens, split by
   the provider's peak window.
3. **Actual USD** — the provider's balance, sampled, differenced. The only number
   that is money rather than arithmetic.

## Usage and estimate

Every request the harness makes is logged, with a timestamp and a usage object,
so the figures below are read rather than remembered:
`~/.dsh/sessions/--home-k-Code-noka--/*/session.v4.jsonl.zstd`.

<!-- usage:start -->
| Session (UTC) | Local (+07) | Turns | Cache-miss in | Cache-hit in | Output | Peak | Off-peak | Est. USD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-09-29 08:20Z → 10:17Z (c9b83d6c) | 2026-09-29 15:20+07 | 392 | 402,473 | 124,603,520 | 388,812 | $1.1112 | $0.1119 | $1.2230 |
| 2026-09-29 08:30Z → 08:31Z (fa4ae818) | 2026-09-29 15:30+07 | 4 | 31,361 | 49,792 | 4,493 | $0.0151 | $0.0000 | $0.0151 |
| 2026-09-29 08:38Z → 08:38Z (5824641c) | 2026-09-29 15:38+07 | 2 | 14,740 | 14,208 | 5,334 | $0.0109 | $0.0000 | $0.0109 |
| 2026-09-29 09:16Z → 09:16Z (be9fe88c) | 2026-09-29 16:16+07 | 2 | 15,568 | 13,824 | 596 | $0.0055 | $0.0000 | $0.0055 |
| 2026-09-29 10:00Z → 10:00Z (0cc33cd9) | 2026-09-29 17:00+07 | 1 | 5,704 | 128 | 4,108 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-29 10:01Z → 10:01Z (967dd579) | 2026-09-29 17:01+07 | 2 | 15,149 | 14,336 | 2,107 | $0.0000 | $0.0036 | $0.0036 |
| 2026-09-29 10:09Z → 10:09Z (14dc1a86) | 2026-09-29 17:09+07 | 3 | 30,974 | 31,232 | 2,893 | $0.0000 | $0.0065 | $0.0065 |
| **Total** | | **406** | **515,969** | **124,727,040** | **408,343** | **$1.1426** | **$0.1253** | **$1.2679** |

_Estimated from the published deepseek-flash rates, peak and off-peak; generated 2026-09-29 by `node scripts/usage-report.mjs --write`._
<!-- usage:end -->

**How the estimate is built.** Rates are `deepseek-flash` per 1M tokens, from
<https://api-docs.deepseek.com/quick_start/pricing>: cache-hit input $0.003
off-peak / $0.006 peak, cache-miss input $0.15 / $0.30, output $0.60 / $1.20.
Off-peak is exactly half of peak. **Peak is 01:00–04:00 and 06:00–10:00 UTC,
Monday to Friday, excluding Chinese public holidays; everything else, weekends
included, is off-peak.** Each session is bucketed by its own timestamps, which is
why the table shows both UTC and the local `+07` window — the work here happened
mostly inside peak hours, and that is visible in the cost split.

Two things the estimate assumes, stated so it can be wrong out loud: cache-miss
input is taken to be the usage field `inputTokens` and cache-hit input the field
`cacheReadTokens`; and Chinese public holidays are not modelled, so a holiday
weekday is over-charged at peak rates. The assumption is on the safe side.

## Balance ledger (actual USD)

<!-- ledger:start -->
| Recorded (UTC) | Balance | Change | Note |
|---|---:|---:|---|
| 2026-09-29 10:15Z | $28.97 | — | ledger opened — work up to here is estimated, not measured |

_Only one balance recorded so far, so there is nothing to subtract yet. Run `--balance` again after the next block of work._
<!-- ledger:end -->

The ledger is sampled by hand — `node scripts/usage-report.mjs --balance "note"`
— because the provider exposes a balance endpoint but no per-day spend endpoint.
The difference between two samples is what was actually deducted, which beats any
estimate built from token counts and a rate table.

The baseline sample is dated today, so the work in the table above was **not yet
measured** when the ledger opened: it is the estimate, and it will stay an
estimate. Everything after the last row is measured. If you want the earlier
figure exactly, the provider's billing page knows it; nothing here can
reconstruct it.

## Refreshing this file

```sh
node scripts/usage-report.mjs                              # print
node scripts/usage-report.mjs --write                      # refresh both blocks
node scripts/usage-report.mjs --balance "end of phase 6"   # sample the balance, then --write
```

The script reads the harness's logs and the provider's balance endpoint; it
writes nothing else. It reports this workspace only.

## What this file is not

- Not a budget. There is no cap in place; this records, it does not brake.
- Not a forecast. A phase that goes smoothly costs less than one that fights the
  framework, and so far the second kind has been the norm — three of the seven
  working blocks in the devlog were spent on bugs that the tests caught.
- Not the whole picture of effort. The free lane carries the thinking, and the
  thinking is what decides whether the code was worth writing.
