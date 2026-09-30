# API

The endpoint contract of PLAN §15, with what is actually implemented today.
Status: ✅ built · ⏳ planned (phase in brackets).

## Public pages

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/` | Landing: what the card is, signup/login entry, static sponsor logos (D18). English only. | ✅ placeholder |
| GET | `/privacy`, `/terms` | Policy pages. | ⏳ (9) |
| GET | `/robots.txt` | `Disallow: /c/`, `Disallow: /dashboard/`. | ✅ |
| GET | `/dashboard/settings/export` | Owner's own data as a JSON attachment (`no-store`): contacts decrypted, notes, card + PIN. Portability, Art. 20. | ✅ |
| POST | `/dashboard/settings/delete` | Erases the account and everything cascading from it, clears the session cookie, redirects to `/?deleted=1`. Erasure, Art. 17. | ✅ |
| GET | `/privacy` \| `/terms` \| `/imprint` | Legal pages on the owner plane (footer links). Indexable, no data access. | ✅ |
| GET | `/healthz` | JSON healthcheck; 503 when the database is unreachable. | ✅ |

## Guest plane — `/c/*`

No account, no JavaScript, no third-party request. Every response carries the
§5 header set (CSP `default-src 'none'`, `no-store`, `no-referrer`, `noindex`,
`Vary: Accept-Language, Cookie`).

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET | `/c/{slug}` | 200 localised PIN form, no contact data in the HTML. Unknown, revoked and deactivated slugs return a byte-identical page (language switcher included). | ✅ |
| POST | `/c/{slug}` | body `pin`. 303 → `/view` on success; 200 form + generic error on failure; the response takes at least 350 ms either way. Rate limiting (429 + `Retry-After`) lands in Phase 6. | ✅ flow, ⏳ (6) limiter |
| GET | `/c/{slug}/view` | 200 responder view with a valid cookie; otherwise 303 → `/c/{slug}`, never an error page. Also redirects when the card was deactivated or its PIN rotated after the cookie was issued. | ✅ |
| POST | `/c/{slug}/lang` | body `lang`, one of `cards.languages` (the default set for an unknown card). Sets the language cookie, 303 back to the current step. No existence oracle, no query string. | ✅ |
| POST | `/c/{slug}/exit` | Clears the view **and** language cookies, 303 → `/c/{slug}`. The "Exit" button. | ✅ |

## Owner plane — `/dashboard`, English only

better-auth session, SSR forms, origin-checked POSTs.

| Method | Path | Behaviour | Status |
|---|---|---|---|
| GET/POST | `/signup` | Account lifecycle; the first name is captured here (D27), because better-auth requires it. | ✅ |
| GET/POST | `/login` | Session cookie on success; one message for every failure. | ✅ |
| GET/POST | `/forgot`, `/reset` | Reset tokens, single-use and short-lived, sent through Resend. | ⏳ (2b — needs the sending domain) |
| ANY | `/api/auth/*` | better-auth (Google callback, session). | ✅ (email+password) |
| POST | `/logout` | Server-side session revocation; POST only, origin-checked. | ✅ |
| GET | `/dashboard` | The whole owner plane on one page: contacts, then notes, then the card. | ✅ |
| GET/POST | `/dashboard/profile` | First name; email change. | ⏳ (2b) |
| POST | `/dashboard/card/create` | Make the card. **Refused with no contacts**; live immediately (ADR-020). | ✅ |
| POST | `/dashboard/card/new` | "New card": new slug and new PIN together, killing the printed one. | ✅ |
| GET | `/dashboard/card/card.jpg` | The card as a 300 dpi JPEG (QR + PIN), `no-store`, never cached. | ✅ |
| GET | `/dashboard/card/pdf?layout=card\|a4\|sheet` | Print masters, 600 dpi artwork: the card at exactly 53.98 × 85.60 mm, one card on A4, or ten on A4 (2 × 5, rotated) with corner cut marks. `no-store`. An unknown layout falls back to `a4`. | ✅ |
| POST | `/dashboard/contacts/new` | Add a contact: name, relation, phone (E.164), channels, spoken languages. | ✅ |
| POST | `/dashboard/contacts/{id}/edit` | Edit; same validation. | ✅ |
| POST | `/dashboard/contacts/{id}/delete` | Refused while a card exists and this is the last contact. | ✅ |
| POST | `/dashboard/notes` | Free text, stored encrypted, blank clears the row. | ✅ |
| GET | `/dashboard/card/preview` | Responder view rendered for the owner, with a language picker. | ⏳ (7) |
| GET | `/dashboard/card/print/{card\|a4}.pdf` | Deterministic download, replacing the interim JPEG. | ⏳ (7) |
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
