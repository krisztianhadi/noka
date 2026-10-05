import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { getAuth } from '@/lib/auth';
import { scanAttempts } from '@/db/schema';
import { RETENTION_DAYS } from '@/lib/retention';
import { insertOwnerWithCard } from './fixtures';

/**
 * The operator entry point that runs on a schedule (D24). The purge *function* is covered
 * in `retention.test.ts`; this covers the wiring, because that is where the failures were.
 *
 * Two of them, in the same week: `src/config/` — the sponsor configuration added in Phase 8
 * — shadowed `src/config.ts` in `scripts/alias-loader.mjs` (the loader accepted a directory
 * as a module and Node refused with `ERR_UNSUPPORTED_DIR_IMPORT`), and the script was named
 * `purge`, which pnpm intercepts as its own command, so `pnpm purge --dry-run` never ran
 * this code at all. Neither was visible to any existing test: the unit tests import the
 * function directly and never touch the loader or the package scripts.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('operator entry points', () => {
  const db = getDb();
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId));
    await closeDb();
  });

  it('seeds a single-user instance, and a second run never touches the password', async () => {
    // The email-only self-hosted shape: registration closed, no mail provider, one account made at
    // container start. Both halves matter — an instance that seeds nothing is a locked door, and one
    // that re-seeds on every restart locks the owner out of their own copy.
    const email = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
    const password = 'a-seeded-password';
    const env = { ...process.env, ALLOW_REGISTRATION: 'false', NOKA_OWNER_EMAIL: email, NOKA_OWNER_PASSWORD: password };
    let seededId: string | undefined;

    try {
      const first = execFileSync('pnpm', ['seed-owner'], { encoding: 'utf8', env, timeout: 60_000 });
      expect(first).toContain(`created the owner account ${email}`);

      const [created] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      seededId = created?.id;
      expect(seededId).toBeTruthy();

      const second = execFileSync('pnpm', ['seed-owner'], { encoding: 'utf8', env, timeout: 60_000 });
      expect(second).toContain('already has an account');

      // The password from the first run still works: the second run changed nothing.
      const signedIn = await getAuth().api.signInEmail({ body: { email, password } });
      expect(signedIn.user.id).toBe(seededId);
    } finally {
      if (seededId) await db.delete(users).where(eq(users.id, seededId));
    }
  }, 120_000);

  it('runs the retention sweep through pnpm, and the dry run deletes nothing', async () => {
    // A row this test owns, unambiguously past the cutoff: "the dry run changed nothing" is
    // then a statement about a specific row, not about a count another suite can move while
    // it runs.
    const fixture = await insertOwnerWithCard(db);
    userId = fixture.userId;
    const expiredAt = new Date(Date.now() - (RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000);
    const [expired] = await db
      .insert(scanAttempts)
      .values({
        cardId: fixture.cardId,
        kind: 'pin_fail',
        success: false,
        ipPrefixHash: 'deadbeef',
        createdAt: expiredAt,
      })
      .returning({ id: scanAttempts.id });

    const output = execFileSync('pnpm', ['db:purge', '--dry-run'], {
      encoding: 'utf8',
      env: process.env,
      timeout: 60_000,
    });

    expect(output).toContain('retention:');
    expect(output).toContain('would delete');

    const survivor = await db
      .select({ id: scanAttempts.id })
      .from(scanAttempts)
      .where(eq(scanAttempts.id, expired!.id));
    expect(survivor).toHaveLength(1);
  }, 90_000);
});
