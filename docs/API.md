# API

The endpoint contract of PLAN §15, with what is actually implemented today.
Status: ✅ built · ⏳ planned (phase in brackets).

## Public pages

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/` | Landing: what the card is, signup/login entry, static sponsor logos (D18). English only. | ✅ placeholder |
| GET | `/privacy`, `/terms` | Policy pages. | ⏳ (9) |
| GET | `/robots.txt` | `Disallow: /c/`, `Disallow: /dashboard/`. | ✅ |
| GET | `/healthz` | JSON healthcheck; 503 when the database is unreachable. | ✅ |

## Guest plane — `/c/*`

No account, no JavaScript, no third-party request. Every response carries the
§5 header set (CSP `default-src 'none'`, `no-store`, `no-referrer`, `noindex`,
`Vary: Accept-Language, Cookie`).

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/c/{slug}` | 200 localised PIN form, no contact data in the HTML. Unknown, revoked and deactivated slugs return the identical form. | ⏳ (5) |
| POST | `/c/{slug}` | body `pin`. 303 → `/view` on success; 200 form + generic error on failure; 429 + `Retry-After` when backed off. | ⏳ (5) |
| GET | `/c/{slug}/view` | 200 responder view with a valid cookie; otherwise 303 → `/c/{slug}`, never an error page. | ⏳ (5) |
| POST | `/c/{slug}/hide` | Clears the view **and** language cookies, 303 → `/c/{slug}`. | ⏳ (5) |
| POST | `/c/{slug}/lang` | body `lang`, one of `cards.languages`. Sets the language cookie, 303 back to the current step. 400 on an unsupported code; no existence oracle, no query string. | ⏳ (5) |

## Owner plane — `/dashboard`, English only

better-auth session, SSR forms, origin-checked POSTs.

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET/POST | `/signup` | Account lifecycle; the first name is captured here (D27), because better-auth requires it. | ✅ |
| GET/POST | `/login` | Session cookie on success; one message for every failure. | ✅ |
| GET/POST | `/forgot`, `/reset` | Reset tokens, single-use and short-lived, sent through Resend. | ⏳ (2b — needs the sending domain) |
| ANY | `/api/auth/*` | better-auth (Google callback, session). | ✅ (email+password) |
| POST | `/logout` | Server-side session revocation; POST only, origin-checked. | ✅ |
| GET | `/dashboard` | Guarded owner shell. Card summary, PIN, scan activity land in Phase 3. | ✅ shell |
| GET/POST | `/dashboard/profile` | First name; email change. | ⏳ (2b) |
| GET/POST | `/dashboard/card` | Onboarding: exactly one card, ≥1 contact to activate, origin warning. | ⏳ (3) |
| POST | `/dashboard/card/rotate-pin` | New PIN, bumps `pin_version`, kills live view cookies. | ⏳ (3) |
| POST | `/dashboard/card/regenerate-slug` | New QR; the old printed card stops working permanently. | ⏳ (3) |
| POST | `/dashboard/card/deactivate` \| `/activate` | Gates the guest URL **and** the print endpoints. | ⏳ (3) |
| GET/POST | `/dashboard/contacts[/new\|/{id}/edit]`, `POST .../delete` | Encrypted CRUD; relation from the fixed vocabulary (D31); the last contact cannot be deleted while active (D28). | ⏳ (4) |
| GET/POST | `/dashboard/notes` | Free text, consent line. | ⏳ (4) |
| GET | `/dashboard/card/preview` | Responder view rendered for the owner, with a language picker. | ⏳ (7) |
| GET | `/dashboard/card/print/{card\|a4}.pdf` | Deterministic download; disappears when inactive. | ⏳ (7) |
| GET | `/dashboard/card/print.svg` | Engraving vector, text as paths. | ⏳ (later) |
| GET | `/dashboard/activity` | Aggregated scan/failure log. | ⏳ (6) |
| GET | `/dashboard/export` | JSON export of the account's data. | ⏳ (9) |
| POST | `/dashboard/delete-account` | Hard delete; warns that printed cards die with it. | ⏳ (9) |

## Non-HTTP surfaces

| Surface | Behaviour | Status |
|---|---|---|
| `scripts/migrate-on-start.mjs` | Advisory-locked Drizzle migration on container start. | ✅ |
| `scripts/purge.mjs` | 30-day retention sweep for `scan_attempts` (Railway cron, D24). | ⏳ (6) |

## Contracts worth stating twice

- **The responder planes are script-free.** Asserted per response in
  `tests/e2e/smoke.spec.ts`, for all five languages once they exist.
- **Nothing decrypted is logged.** pino redaction covers `payload`, `pin`,
  `phone` and `notes`; the integration test also proves a raw `SELECT` shows no
  plaintext.
- **Unknown slugs and wrong PINs are indistinguishable**, in content and timing
  (layer 0 of §6: identical form, decoy argon2 verify, padded response floor).
