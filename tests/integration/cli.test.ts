import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
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
