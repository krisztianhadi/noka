import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getAuth } from '@/lib/auth';
import { closeDb, getDb } from '@/db/client';
import { accounts, sessions, users } from '@/db/auth-schema';

/**
 * Owner plane against the real database (§3, D8). Skipped without a database.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const PASSWORD = 'correct-horse-battery';

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

describeDb('owner auth', () => {
  const auth = getAuth();
  const db = getDb();
  const createdEmails: string[] = [];

  function freshEmail(): string {
    const email = `auth-${randomUUID()}@noka.test`;
    createdEmails.push(email);
    return email;
  }

  afterAll(async () => {
    for (const email of createdEmails) await db.delete(users).where(eq(users.email, email));
    await closeDb();
  });

  it('signs up, sets a session cookie and stores an argon2id password', async () => {
    const email = freshEmail();
    const response = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: 'Maria' },
      asResponse: true,
    });

    expect(response.status).toBe(200);
    const cookie = cookieHeader(response);
    expect(cookie).toContain('better-auth.session_token');

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.name).toBe('Maria');
    // better-auth lowercases the address; ADR-004 keeps the column plaintext.
    expect(user?.email).toBe(email);

    const [account] = await db.select().from(accounts).where(eq(accounts.userId, user!.id));
    expect(account?.providerId).toBe('credential');
    expect(account?.password).toMatch(/^\$argon2id\$/);
    expect(account?.password).not.toContain(PASSWORD);

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(user!.id);
  });

  it('refuses a duplicate address', async () => {
    const email = freshEmail();
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'First' }, asResponse: true });
    const second = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: 'Second' },
      asResponse: true,
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
    const owners = await db.select().from(users).where(eq(users.email, email));
    expect(owners).toHaveLength(1);
  });

  it('refuses a password below the minimum length', async () => {
    const response = await auth.api.signUpEmail({
      body: { email: freshEmail(), password: 'short', name: 'Short' },
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const email = freshEmail();
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'Maria' }, asResponse: true });

    const good = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
    expect(good.status).toBe(200);
    expect(cookieHeader(good)).toContain('better-auth.session_token');

    const bad = await auth.api.signInEmail({ body: { email, password: 'not-the-password' }, asResponse: true });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('does not reveal whether the address exists', async () => {
    const email = freshEmail();
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'Maria' }, asResponse: true });

    const wrongPassword = await auth.api.signInEmail({ body: { email, password: 'wrong' }, asResponse: true });
    const unknownAccount = await auth.api.signInEmail({
      body: { email: `nobody-${randomUUID()}@noka.test`, password: 'wrong' },
      asResponse: true,
    });

    expect(await wrongPassword.text()).toBe(await unknownAccount.text());
    expect(wrongPassword.status).toBe(unknownAccount.status);
  });

  it('revokes the session server-side on sign out', async () => {
    const email = freshEmail();
    const signUp = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: 'Maria' },
      asResponse: true,
    });
    const cookie = cookieHeader(signUp);
    const headers = new Headers({ cookie });

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(await db.select().from(sessions).where(eq(sessions.userId, user!.id))).toHaveLength(1);

    await auth.api.signOut({ headers, asResponse: true });

    // The row is gone: a stolen cookie cannot be replayed, not merely forgotten
    // by the browser (§3 isolation rule).
    expect(await db.select().from(sessions).where(eq(sessions.userId, user!.id))).toHaveLength(0);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });
});
