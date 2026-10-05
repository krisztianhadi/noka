import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getAuth, passwordResetUrl } from '@/lib/auth';
import { closeDb, getDb } from '@/db/client';
import { verifications } from '@/db/auth-schema';

/**
 * The whole reset flow, minus the two pages the browser renders (2026-10-05).
 *
 * This is the flow a locked-out owner depends on, and every part of it is silent when it breaks:
 * the request answers the same whether or not the account exists, the token lives in the
 * `verifications` table for an hour, and the mail may only have reached the log. So the test walks
 * it end to end against the real library and the real database — ask for a reset, take the token
 * the mail would have carried, spend it, and sign in with the new password — and then checks the
 * two things that make a reset safe: the token is single-use, and the old password is gone.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('password reset', () => {
  const db = getDb();
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
  const originalPassword = 'the-original-password';
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) await db.delete(verifications).where(eq(verifications.value, userId));
    await closeDb();
  });

  it('mails a link that works once, and the new password is the one that works afterwards', async () => {
    const auth = getAuth();

    const signUp = await auth.api.signUpEmail({
      body: { email, password: originalPassword, name: 'Reset Test' },
    });
    userId = signUp.user.id;

    // 1. The request. It answers the same for an address that exists and one that does not — the
    //    test only needs it to have stored a token.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset' } });

    const [stored] = await db
      .select({ identifier: verifications.identifier })
      .from(verifications)
      .where(eq(verifications.value, userId))
      .limit(1);
    expect(stored?.identifier.startsWith('reset-password:')).toBe(true);
    const token = stored!.identifier.slice('reset-password:'.length);

    // 2. The link the mail carries points at our page, not at better-auth's REST path.
    expect(passwordResetUrl(token)).toBe(`${process.env.PUBLIC_CARD_ORIGIN}/reset?token=${token}`);

    // 3. Spend it.
    const reset = await auth.api.resetPassword({ body: { newPassword: 'a-fresh-password', token } });
    expect(reset).toBeTruthy();

    // 4. The new password signs in, the old one does not.
    const signedIn = await auth.api.signInEmail({ body: { email, password: 'a-fresh-password' } });
    expect(signedIn.user.id).toBe(userId);
    await expect(auth.api.signInEmail({ body: { email, password: originalPassword } })).rejects.toThrow();

    // 5. Single use: the same token cannot be spent again.
    await expect(
      auth.api.resetPassword({ body: { newPassword: 'a-third-password', token } }),
    ).rejects.toThrow();
  }, 60_000);
});
