import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getConfig } from '@/config';
import { argon2Hash, argon2Verify } from '@/lib/argon2';
import { getDb } from '@/db/client';
import { emailFrom, emailTransport } from '@/lib/email/transport';
import { accounts, sessions, users, verifications } from '@/db/auth-schema';

/**
 * Owner plane (D8, §3). Email + password, plus Google sign-in and the password-reset mail
 * whenever their environment variables are set (2026-10-05): the wiring is here, and the
 * credentials are the only thing missing.
 *
 * `usePlural` matches the table names in schema; the ids are uuids because the
 * app generates them here rather than letting better-auth mint strings.
 */
/**
 * The link in the reset mail.
 *
 * better-auth hands us its own URL, and it points at its REST path (`/reset-password/<token>`) —
 * a route that does not exist in this application, because better-auth is mounted under
 * `/api/auth`. So the token is used and the link is built here, where it can be tested: it must
 * point at the page that has the form, and nothing else about it may change.
 */
export function passwordResetUrl(token: string): string {
  return `${getConfig().PUBLIC_CARD_ORIGIN}/reset?token=${encodeURIComponent(token)}`;
}

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
      /**
       * The reset mail (2026-10-05). better-auth mints the single-use token and hands us the URL;
       * the transport decides whether it goes anywhere — with no provider configured it lands in
       * the log, where a developer clicks it, and a deployed instance sends it through Resend.
       *
       * The message says nothing about the account beyond the link. An address that receives it is
       * already known to whoever asked, and "your account" phrasing is a gift to anyone who
       * mistypes an address at a shared machine.
       */
      sendResetPassword: async ({ user, token }) => {
        await emailTransport().send(
          {
            to: user.email,
            subject: 'Reset your noka password',
            text: [
              'Someone asked to reset the password for this address on noka.',
              '',
              `If it was you: ${passwordResetUrl(token)}`,
              '',
              'The link works once and expires on its own. If it was not you, nothing happened:',
              'your password is unchanged, and you can ignore this message.',
            ].join('\n'),
          },
          emailFrom(),
        );
      },
    },
    // Google sign-in appears the moment both variables are set and stays out of the way until
    // then: an OAuth button that cannot work is worse than no button (2026-10-05).
    ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET },
          },
        }
      : {}),
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

/**
 * Better-auth's `changeEmail` requires a working verification-email flow, and there
 * is no mailer until the Resend domain exists. So the owner's address is updated
 * directly here, immediately and without a confirmation link (ADR-023). The unique
 * index is what makes "already taken" an honest answer rather than a silent
 * overwrite, and when the mailer lands this becomes a verification flow.
 */
export async function changeOwnerEmail(userId: string, newEmail: string): Promise<'ok' | 'taken'> {
  try {
    await getDb()
      .update(users)
      .set({ email: newEmail.toLowerCase(), emailVerified: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return 'ok';
  } catch {
    return 'taken';
  }
}

/** How long the owner's own name may be. Same ceiling as a contact's, for the same reason. */
export const MAX_OWNER_NAME_LENGTH = 80;

/**
 * Change the owner's first name.
 *
 * This is the name a responder sees above the contacts on the card page (`view.headingFor`), and
 * the dashboard greets the owner with it. Empty is a legitimate value, not an error: the page
 * then says "Emergency contacts" and names nobody (D27) — a card lying in a wallet should not
 * announce whose it is, which is also why the printed artwork carries no name at all.
 */
export async function changeOwnerName(userId: string, name: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Is this the owner's current password?
 *
 * Used before changing the email, which is the account's only recovery channel (ADR-023). The
 * hash is the same Argon2id as everywhere else, so this is one comparison and no session work.
 */
export async function verifyOwnerPassword(userId: string, password: string): Promise<boolean> {
  if (password.length === 0) return false;
  const [account] = await getDb()
    .select({ hash: accounts.password })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  if (!account?.hash) return false;
  try {
    return await argon2Verify(account.hash, password);
  } catch {
    return false;
  }
}
