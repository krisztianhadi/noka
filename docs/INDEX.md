# noka — documentation index

**noka** — *next of kin access*. A printed ISO ID-1 card carrying a QR code and a
6-digit PIN. Anyone who finds it scans, enters the PIN, and sees the owner's
emergency contacts on a server-rendered page that works on a bad mobile connection.
(The earlier working title **Nokard is archived**.)

Status: **pre-code**. The git repo holds only `docs/`. Phases, decisions and the
endpoint contract live in the plan.

| Document | What it is |
|---|---|
| [PLAN.md](PLAN.md) | The build contract — decisions, threat model, schema, phases, endpoint contract, environment. **Start here.** |
| [ORIGINAL_BRIEF.md](ORIGINAL_BRIEF.md) | Historical: the spec as first pasted on 2026-09-29. Superseded by PLAN.md, kept for provenance. |

Created with the scaffold in Phase 1, per the project-docs method:

| Document | What it will hold |
|---|---|
| `../README.md` | Under 200 lines: what it is, quick start, how to run it. |
| `API.md` | The endpoint contract, split out of PLAN §15. |
| `ARCHITECTURE.md` | How the pieces fit, plus the ADRs — including every decision PLAN marked as a spike. |
| `SETUP.md` | Environment, services, ports, where credentials live, and the breach procedure. |
| `CHANGELOG.md` | Reverse-chronological, dated, tagged Feature / Fix / Break. |

## Where to look first

- **Why is the PIN only 6 digits?** PLAN §3, "The actual security argument".
- **Why not pgcrypto, when the brief asked for it?** PLAN D1, §4.
- **Why does the responder page speak five languages?** PLAN §3, D19–D20.
- **What is not built on purpose?** PLAN §13 and §17.
