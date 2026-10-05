#!/usr/bin/env node
/**
 * Seed the owner account on an instance that has closed registration (2026-10-05).
 *
 * This is the "email-less single-user" shape, copied from the sibling project: a solo deployment
 * wants no sign-up form and no mail provider — nobody has to receive anything to sign in. What it
 * does need is one account, and the only safe moment to make it is at container start, before the
 * server accepts a request.
 *
 * **No application code is imported here, on purpose.** The runner image carries `dist/`,
 * `drizzle/`, `scripts/` and production `node_modules` — not `src/` — so a seeder that imported the
 * app's TypeScript would work locally and fail in the container. It writes the two rows better-auth
 * expects, hashed with the same Argon2id parameters the app uses, and
 * `tests/integration/cli.test.ts` proves the result by signing in through better-auth afterwards:
 * if the columns or the hash drifted, that test fails rather than the operator's first login.
 *
 *   1. Registration open → nothing to do. Exit quietly.
 *   2. The address already has an account → say so and exit. A restart must never touch an
 *      existing password, or it would lock the owner out of their own instance.
 *   3. Otherwise create it, with `NOKA_OWNER_PASSWORD` when given and a generated one when not.
 *      The generated password is printed once, which is where a self-hoster looks after
 *      `docker compose up`; the script says to change it.
 *
 *     pnpm seed-owner
 *     node scripts/seed-owner.mjs        # what the container runs
 */
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import postgres from 'postgres';

const TRUTHY = ['1', 'true', 'yes', 'on'];
const FALSY = ['0', 'false', 'no', 'off'];

function flag(name, fallback) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUTHY.includes(raw)) return true;
  if (FALSY.includes(raw)) return false;
  console.error(`seed: ${name}="${process.env[name]}" is not a boolean.`);
  process.exit(1);
}

/** Argon2id, OWASP parameters — the same ones `src/lib/argon2.ts` uses. */
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 };

if (flag('ALLOW_REGISTRATION', true)) {
  console.log('seed: registration is open, so there is nothing to seed.');
  process.exit(0);
}

const email = process.env.NOKA_OWNER_EMAIL?.trim().toLowerCase();
const name = process.env.NOKA_OWNER_NAME?.trim() || 'Owner';
const url = process.env.DATABASE_UNPOOLED_URL ?? process.env.DATABASE_URL;

if (!email) {
  console.error('seed: ALLOW_REGISTRATION=false needs NOKA_OWNER_EMAIL.');
  process.exit(1);
}
if (!url) {
  console.error('seed: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  const existing = await sql`select id from users where email = ${email} limit 1`;
  if (existing.length > 0) {
    console.log(`seed: ${email} already has an account — leaving it untouched.`);
    process.exit(0);
  }

  const configured = process.env.NOKA_OWNER_PASSWORD?.trim();
  const password = configured || randomBytes(18).toString('base64url');
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  // One transaction: a user row without its credential row is an account that cannot sign in.
  const created = await sql.begin(async (tx) => {
    const [user] = await tx`
      insert into users (name, email) values (${name}, ${email})
      on conflict (email) do nothing
      returning id
    `;
    // Another replica seeded the same address in the meantime — not an error, and not our job.
    if (!user) return null;

    await tx`
      insert into accounts (provider_id, account_id, user_id, password)
      values ('credential', ${user.id}, ${user.id}, ${passwordHash})
    `;
    return user.id;
  });

  if (!created) {
    console.log(`seed: ${email} was created by another start — leaving it untouched.`);
    process.exit(0);
  }

  console.log(`seed: created the owner account ${email}`);
  if (!configured) {
    console.log(`seed: generated password (change it after signing in): ${password}`);
  }
} catch (error) {
  console.error(`seed: could not seed the owner — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
