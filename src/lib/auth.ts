import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getConfig } from '@/config';
import { argon2Hash, argon2Verify } from '@/lib/argon2';
import { getDb } from '@/db/client';
import { accounts, sessions, users, verifications } from '@/db/auth-schema';

/**
 * Owner plane (D8, §3). Email + password today; Google OAuth and the
 * Resend-backed reset are added in Phase 2's second half.
 *
 * `usePlural` matches the table names in schema; the ids are uuids because the
 * app generates them here rather than letting better-auth mint strings.
 */
export type Auth = ReturnType<typeof createAuth>;

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: 'noka',
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL ?? config.PUBLIC_CARD_ORIGIN,
    // Sessions live in Postgres, so revoking one is a server-side act (§3).
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
    emailAndPassword: {
      enabled: true,
      // A six-digit PIN guards a card; the account behind it gets a real password.
      minPasswordLength: 10,
      requireEmailVerification: false,
      // One KDF everywhere: Argon2id instead of better-auth's default scrypt.
      password: {
        hash: (password) => argon2Hash(password),
        verify: ({ hash: storedHash, password }) => argon2Verify(storedHash, password),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      changeEmail: { enabled: true },
    },
    trustedOrigins: [config.PUBLIC_CARD_ORIGIN, config.BETTER_AUTH_URL].filter(
      (origin): origin is string => Boolean(origin),
    ),
  });
}

let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
