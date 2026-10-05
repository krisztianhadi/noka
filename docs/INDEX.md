# noka — documentation index

**noka** — *next of kin access*. A printed ISO ID-1 card carrying a QR code and a
6-digit PIN. Anyone who finds it scans, enters the PIN, and sees the owner's
emergency contacts on a server-rendered page that works on a bad mobile
connection. (The earlier working title **Nokard is archived**.)

Status: **Phases 0–8 built** (2026-10-05) — the product works end to end locally.
Sign up, add the first contact, and the card exists: open its URL, enter the PIN,
and the responder page renders in one request, localised, with no JavaScript. The
PIN endpoint is rate-limited and audited, the print masters are downloadable (the
card at ISO ID-1, one on A4, ten on A4), `/demo` runs the scan flow with invented
people, and the sponsor strip is wired on the landing and auth pages — empty until
there is a sponsor to name, and structurally unable to reach `/c/*` or `/dashboard`.
**Phase 9** (hardening and launch) is next: threat model, the error-tracking
decision, staging, backup and restore drill, smoke load test, runbook. Left in
Phase 7: the no-PIN variant and the physical print/scan test, which needs a printer.
See [CHANGELOG.md](CHANGELOG.md), and [PLAN.md](PLAN.md) §11 for the exit criteria
per phase.

| Document | What it is |
|---|---|
| [PLAN.md](PLAN.md) | The build contract — decisions D1–D32, threat model, schema, phases, endpoint contract, environment. **Start here.** |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit: the shape, the data flow of a contact, the encrypted blob format. |
| [API.md](API.md) | Endpoint contract with a built/planned status per route. |
| [I18N.md](I18N.md) | Adding a language: the three-file recipe for a new locale, and the rules the build enforces. |
| [SETUP.md](SETUP.md) | Services, ports, environment, credentials, sandbox quirks, breach procedure. |
| [DECISIONS.md](DECISIONS.md) | The ADRs: 32 numbered decisions, the one this project reversed, and the open ones. |
| [CHANGELOG.md](CHANGELOG.md) | Reverse-chronological, dated, tagged Feature / Fix / Break. |
| [COSTS.md](COSTS.md) | What the build costs: per-feature attribution, peak/off-peak timing, real USD ledger. |
| [blog/DEVLOG.md](blog/DEVLOG.md) | The development log — raw material for posts, append-only. |
| [blog/2026-09-29-the-post-it-in-my-wallet.md](blog/2026-09-29-the-post-it-in-my-wallet.md) | Product-story post draft (unpublished). |
| [blog/2026-09-29-four-cents-for-a-card.md](blog/2026-09-29-four-cents-for-a-card.md) | Cost-story post draft (unpublished). |
| [blog/2026-09-29-building-noka-in-a-day.md](blog/2026-09-29-building-noka-in-a-day.md) | Day one: the three verification failures (unpublished). |
| [blog/2026-09-30-five-millimetres.md](blog/2026-09-30-five-millimetres.md) | Day two: design passes, a measured contradiction, and a limit that let you past it (unpublished). |
| [../README.md](../README.md) | Under 200 lines: what it is, quick start, scripts. |
| [ORIGINAL_BRIEF.md](ORIGINAL_BRIEF.md) | Historical: the spec as first pasted on 2026-09-29. Superseded by PLAN.md, kept for provenance. |

## Where to look first

- **Why is the PIN only 6 digits?** PLAN §3, "The actual security argument".
- **Why not pgcrypto, when the brief asked for it?** PLAN D1, §4 and ADR-003.
- **Why is the owner's email in plaintext, when PLAN said it would not be?**
  ADR-004 — the Phase 0 spike, and what it costs.
- **Why does the responder page speak five languages?** PLAN §3, D19–D20, ADR-006.
- **What is not built on purpose?** PLAN §13 and §17, plus README's "deliberately not here".
- **What would I defend in a design review?** [DECISIONS.md](DECISIONS.md), and ADR-004 in
  particular — the decision that was reversed, and why.
