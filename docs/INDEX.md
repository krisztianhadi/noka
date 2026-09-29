# noka — documentation index

**noka** — *next of kin access*. A printed ISO ID-1 card carrying a QR code and a
6-digit PIN. Anyone who finds it scans, enters the PIN, and sees the owner's
emergency contacts on a server-rendered page that works on a bad mobile
connection. (The earlier working title **Nokard is archived**.)

Status: **Phase 5** — the product works end to end locally. Sign up, build a
card, add contacts, switch it on, then open the card URL and enter the PIN: the
responder page is localised, renders in one request and runs no JavaScript. Rate
limiting on the PIN endpoint (Phase 6) is the next security-relevant step; see
[CHANGELOG.md](CHANGELOG.md).

| Document | What it is |
|---|---|
| [PLAN.md](PLAN.md) | The build contract — decisions D1–D31, threat model, schema, phases, endpoint contract, environment. **Start here.** |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit: the shape, the data flow of a contact, the encrypted blob format. |
| [API.md](API.md) | Endpoint contract with a built/planned status per route. |
| [SETUP.md](SETUP.md) | Services, ports, environment, credentials, sandbox quirks, breach procedure. |
| [DECISIONS.md](DECISIONS.md) | The ADRs: 19 numbered decisions, the one this project reversed, and the open ones. |
| [CHANGELOG.md](CHANGELOG.md) | Reverse-chronological, dated, tagged Feature / Fix / Break. |
| [COSTS.md](COSTS.md) | What the build costs: per-feature attribution, peak/off-peak timing, real USD ledger. |
| [blog/DEVLOG.md](blog/DEVLOG.md) | The development log — raw material for posts, append-only. |
| [blog/2026-09-29-the-post-it-in-my-wallet.md](blog/2026-09-29-the-post-it-in-my-wallet.md) | Product-story post draft (unpublished). |
| [blog/2026-09-29-four-cents-for-a-card.md](blog/2026-09-29-four-cents-for-a-card.md) | Cost-story post draft (unpublished). |
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
