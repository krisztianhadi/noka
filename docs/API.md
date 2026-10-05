# API

The endpoint contract of PLAN §15, with what is actually implemented today.
Status: ✅ built · ⏳ planned (phase in brackets). Checked against the code
**2026-10-01**.

## Public pages

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/` | Landing: what the card is, signup/login entry, the sponsor strip (D18). Copy is English only for now, inline rather than in the catalogue — the wording waits on a read, and translating a draft is work thrown away if a headline changes. | ✅ |
| — | sponsor marks | Rendered by `SponsorStrip.astro` on the landing page and the auth pages only, from `src/config/sponsors.ts` (empty until there is a sponsor to name). Self-hosted SVGs under `/sponsors/`; `usableSponsors()` drops anything that is not a same-origin logo and a safe `https:` or same-site link. | ✅ |
| GET | `/privacy` \| `/terms` \| `/imprint` | Policy pages, linked from every footer. Indexable, no data access; the printed-card terms live here. | ✅ |
| GET | `/robots.txt` | `Disallow: /c/`, `Disallow: /dashboard/`. | ✅ |
| GET | `/healthz` | JSON healthcheck; 503 when the database is unreachable. | ✅ |
| POST | `/language` | Owner-plane language: sets the locale cookie, 303 back to the `next` path. A `next` value that is a full URL is refused — that is how a language switcher becomes an open redirect. | ✅ |
| GET | `/demo`, `/demo/view` | The scan flow with invented people and fictional numbers, rendered by the responder layout and stylesheet. | ✅ |
| POST | `/demo/enter`, `/demo/exit` | The demo PIN compares a constant and sets an hour-long cookie; exit clears it. Deliberately does not touch the cards table. | ✅ |

## Guest plane — `/c/*`

No account, no JavaScript, no third-party request. Every response carries the
§5 header set (CSP `default-src 'none'`, `no-store`, `no-referrer`, `noindex`,
`Vary: Accept-Language, Cookie`).

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/c/{slug}` | 200 localised PIN form, no contact data in the HTML. Unknown, revoked and deactivated slugs return a byte-identical page (language switcher included). | ✅ |
| POST | `/c/{slug}` | body `pin`. 303 → `/view` on success; 200 form + generic error on failure; the response takes at least 350 ms either way. Rate-limited with a capped backoff and `Retry-After` (no permanent lock), and the attempt is audited. | ✅ |
| GET | `/c/{slug}/view` | 200 responder view with a valid cookie; otherwise 303 → `/c/{slug}`, never an error page. Also redirects when the card was deactivated or its PIN rotated after the cookie was issued. | ✅ |
| POST | `/c/{slug}/lang` | body `lang`, one of `cards.languages` (the default set for an unknown card). Sets the language cookie, 303 back to the current step. No existence oracle, no query string. | ✅ |
| POST | `/c/{slug}/exit` | Clears the view **and** language cookies, 303 → `/c/{slug}`. The "Exit" button. | ✅ |

## Owner plane — `/dashboard`

better-auth session, SSR forms, origin-checked POSTs (`Origin`, falling back to
`Referer` when a proxy drops it; both missing is a refusal). Copy comes from the
catalogue in all five locales — D13's English-only rule was superseded (ADR-032);
the locale is cookie → `Accept-Language` → English.

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET/POST | `/signup` | Account lifecycle; the first name is captured here (D27), because better-auth requires it. Carries the sponsor strip. | ✅ |
| GET/POST | `/login` | Session cookie on success; one message for every failure. Carries the sponsor strip. | ✅ |
| GET/POST | `/forgot`, `/reset` | Reset tokens, single-use and short-lived, sent through Resend. | ⏳ (2b — needs the sending domain) |
| ANY | `/api/auth/*` | better-auth (Google callback, session). | ✅ (email+password) |
| POST | `/logout` | Server-side session revocation; POST only, origin-checked. | ✅ |
| GET | `/dashboard` | The whole owner plane on one page: contacts, notes, then the card plate. | ✅ |
| POST | `/dashboard/start` | First run: writes the contact and then the note, one screen and one request. The first contact is what creates the card. | ✅ |
| POST | `/dashboard/theme` | Dark mode is a cookie, so the first paint is already right (ADR-024). | ✅ |
| GET | `/dashboard/settings` | Account settings: email, password, export, delete. The first name is captured at signup and is not editable yet. | ✅ / ⏳ first name (2b) |
| POST | `/dashboard/settings/email` | New address; **requires the current password**, because the email is the only recovery channel. | ✅ |
| POST | `/dashboard/settings/password` | Current password required; every other session ends. | ✅ |
| GET | `/dashboard/settings/export` | Owner's own data as a JSON attachment (`no-store`): contacts decrypted, notes, card + PIN. Read in one repeatable-read transaction, so an export cannot name one card and carry another card's PIN. Portability, Art. 20. | ✅ |
| POST | `/dashboard/settings/delete` | Erases the account and everything cascading from it, clears the session cookie, redirects to `/?deleted=1`. Erasure, Art. 17. | ✅ |
| POST | `/dashboard/card/create` | Make the card by hand. Refused with no contacts; live immediately (ADR-020). | ✅ |
| POST | `/dashboard/card/new` | "New card": new slug and new PIN together, killing the printed one. | ✅ |
| POST | `/dashboard/card/delete` | Deletes the card only — contacts and notes belong to the owner (ADR-022). The browser confirms first. | ✅ |
| GET | `/dashboard/card/card.jpg` | The card as a 300 dpi JPEG (QR + PIN), `no-store`, never cached. The preview the dashboard plate links to. | ✅ |
| — | card URLs | `PUBLIC_CARD_ORIGIN` when it is reachable; for a **loopback** configuration the request's own host (including `X-Forwarded-*`) is used instead, so a card made on the LAN carries a URL a phone can open. | ✅ |
| GET | `/dashboard/card/pdf?layout=card\|a4\|sheet` | Print masters, 600 dpi artwork: the card at exactly 53.98 × 85.60 mm, one card on A4, or ten on A4 (2 × 5, rotated) with corner cut marks. `no-store`. An unknown layout falls back to `a4`. | ✅ |
| GET | `/dashboard/card/print.svg` | Engraving vector, text as paths. | ⏳ (later) |
| POST | `/dashboard/contacts/new` | Add a contact: name, relation, phone (E.164), channels, spoken languages. Capped at `MAX_CONTACTS` inside the transaction. | ✅ |
| POST | `/dashboard/contacts/{id}/edit` | Edit; same validation. | ✅ |
| POST | `/dashboard/contacts/{id}/delete` | Refused while a card exists and this is the last contact; count and delete share one transaction. | ✅ |
| POST | `/dashboard/notes` | Free text, stored encrypted, blank clears the row. | ✅ |
| POST | `/dashboard/notes/delete` | Clears the note; the card page then shows contacts only. | ✅ |
| GET | `/dashboard/activity` | Aggregated scan/failure log. Attempts are recorded (`scan_attempts`); the owner-facing feed is not built. | ⏳ (deferred) |

## Non-HTTP surfaces

| Surface | Behaviour | Status |
|---|---|---|
| `scripts/migrate-on-start.mjs` | Advisory-locked Drizzle migration on container start. | ✅ |
| `scripts/purge.mjs` | 30-day retention sweep for `scan_attempts`, with `--dry-run` (D24). The code exists and is tested; the Railway cron that should call it is not wired yet. | ✅ built, ⏳ not scheduled |
| `scripts/usage-report.mjs` | The cost instrument: tokens, peak/off-peak windows, estimated USD, and the provider balance ledger. | ✅ |
| `scripts/i18n-report.mjs` | `pnpm i18n:report` — catalogue coverage per locale. | ✅ |

## Contracts worth stating twice

- **The responder planes are script-free.** Asserted per response in
  `tests/e2e/smoke.spec.ts`, for all five languages.
- **Nothing decrypted is logged.** pino redaction covers `payload`, `pin`,
  `phone` and `notes`; the integration test also proves a raw `SELECT` shows no
  plaintext.
- **Unknown slugs and wrong PINs are indistinguishable**, in content and timing
  (layer 0 of §6: identical form, decoy argon2 verify, padded response floor).
- **Nothing sponsor-shaped is reachable from `/c/*` or `/dashboard`.** Enforced by
  `usableSponsors()` (same-origin logos, `https:` or same-site links, nothing counted)
  and asserted by three e2e cases and `tests/unit/sponsors.test.ts`.
