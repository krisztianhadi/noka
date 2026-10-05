# Running noka yourself

noka is MIT licensed and self-hostable: one container, one Postgres, no external service. This
page is the short version — what the flags do, what the container does on start, and what to
check afterwards. The reasoning behind each switch is in [PLAN.md](PLAN.md) and
[DECISIONS.md](DECISIONS.md); the operational detail is in [SETUP.md](SETUP.md) and
[RUNBOOK.md](RUNBOOK.md).

## The five minutes

```sh
git clone https://github.com/krisztianhadi/noka && cd noka
cp .env.example .env
# Fill in the five secrets: PUBLIC_CARD_ORIGIN, VIEW_COOKIE_SECRET, BETTER_AUTH_SECRET,
# CONTACT_ENCRYPTION_KEY, EMAIL_LOOKUP_KEY, IP_HASH_KEY.
#   openssl rand -base64 32     # one per secret (CONTACT_ENCRYPTION_KEY must be 32 bytes)
# And one line for a solo instance:
#   NOKA_OWNER_EMAIL=you@example.com
docker compose up -d
docker compose logs -f noka      # the generated password appears here, once
```

Then open `http://<host>:3200`, sign in with that address and password, and **change the
password** in Settings. The card you make is printed by you; the QR carries
`PUBLIC_CARD_ORIGIN`, so set it to the address a phone can reach *before* printing anything —
`http://192.168.1.x:3200` on a home network is fine, and changing it later invalidates printed
cards.

## What the container does on start

```
node scripts/migrate-on-start.mjs     # apply migrations, under an advisory lock
node scripts/seed-owner.mjs           # create the single owner, if registration is closed
node ./dist/server/entry.mjs          # serve
```

`seed-owner` is a no-op when `ALLOW_REGISTRATION=true`, and on a restart it never touches an
existing account — including its password. If you would rather generate the password yourself,
set `NOKA_OWNER_PASSWORD`.

## The switches

| Variable | Default | What it does |
|---|---|---|
| `SELF_HOSTED` | `false` | Changes what the instance **says about itself**: a `DIY` mark beside the wordmark, and your own operator details in the footer and the imprint. No behaviour changes. |
| `SHOW_LANDING` | `true` | `false` sends `/` to the login screen. A solo instance does not need a marketing page, and the landing is the heaviest page in the product. |
| `ALLOW_REGISTRATION` | `true` | `false` closes sign-up — the page *and* the API. It then requires `NOKA_OWNER_EMAIL`, because an instance with no account and no way to make one is a locked door. |
| `NOKA_OWNER_EMAIL` / `_NAME` / `_PASSWORD` | — | The account `seed-owner` creates when registration is closed. Without the password, one is generated and logged once. |
| `OPERATOR_NAME` / `OPERATOR_EMAIL` / `OPERATOR_URL` | empty on a self-hosted copy | Who runs this instance. Left empty, the footer and the imprint say "a self-hosted copy of noka" instead of crediting the project's author, who is not running your copy. |
| `BRAND_TAG` | `DIY` when `SELF_HOSTED=true`, nothing otherwise | The word after the wordmark. `none` removes it, any other word replaces it. |
| `EMAIL_TRANSPORT` | `log` | `resend` sends password-reset mail through Resend (needs `RESEND_API_KEY` and `EMAIL_FROM`). On `log` the reset link is written to the container log — which is what an email-less single-user instance wants. |

Every flag defaults to the hosted behaviour, so an upgrade that sets nothing changes nothing.

## What you are responsible for

The container does not back up your database, and the contact data is encrypted with
`CONTACT_ENCRYPTION_KEY`:

- **Back up the Postgres volume** (`docker compose exec db pg_dump -U noka noka > backup.sql`).
- **Keep `CONTACT_ENCRYPTION_KEY` somewhere other than that backup.** A dump without the key is
  authenticated ciphertext: nothing readable comes back out. This is by design (ADR-003) and it
  is the one operational footgun of self-hosting noka.
- **Run the retention sweep** if you care about the privacy page being true on your instance:
  `docker compose exec noka node --import ./scripts/register-alias.mjs scripts/purge.mjs` — or a
  cron container of your own. The hosted instance wires it to a Railway cron
  ([RUNBOOK.md](RUNBOOK.md) §4).
- **Restore drills are yours too**: `pnpm drill:restore` is written for the development setup,
  and [RUNBOOK.md](RUNBOOK.md) §5 explains what it does and does not cover.

## The legal pages on your copy

`/privacy`, `/terms` and `/imprint` are written for the hosted instance. On a self-hosted copy
with no `OPERATOR_*` set, the privacy page and the imprint say that plainly and point at
whoever runs it — they do **not** name an operator they do not have, and they do not claim the
hosted instance's promises in your name. If you run a copy for other people, fill in
`OPERATOR_*` and read those pages as *your* policy, not the project's.
