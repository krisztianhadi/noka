import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards, scanAttempts } from '@/db/schema';
import { purgeExpiredAttempts, RETENTION_DAYS, retentionCutoff } from '@/lib/retention';

/**
 * The retention promise (D24, §11): the scan audit trail goes after 30 days.
 *
 * This is the kind of number a privacy policy states and nobody checks, so it is
 * asserted against the real database — the boundary included, because "older than 30
 * days" is exactly where an off-by-one becomes a deleted row that was still covered.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('retention purge', () => {
  const db = getDb();
  const createdUserIds: string[] = [];
  const NOW = new Date('2026-09-29T12:00:00Z');

  async function insertCard(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Owner', email: `purge-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    // Only an id is needed here: the rows under test hang off it by foreign key.
    const [card] = await db
      .insert(cards)
      .values({
        userId: user!.id,
        slug: randomUUID().replace(/-/g, '').slice(0, 26).toUpperCase(),
        pinHash: '$argon2id$v=19$m=19456,t=2,p=1$placeholder',
        pinEncrypted: Buffer.from([1, 2, 3]),
        active: true,
      })
      .returning();
    return card!.id;
  }

  async function insertAttempt(cardId: string, daysAgo: number): Promise<number> {
    const createdAt = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const [row] = await db
      .insert(scanAttempts)
      .values({ cardId, kind: 'pin_fail', success: false, ipPrefixHash: 'deadbeef', createdAt })
      .returning({ id: scanAttempts.id });
    return row!.id;
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('counts the cutoff rather than guessing it', () => {
    expect(retentionCutoff(NOW)).toEqual(new Date(NOW.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000));
  });

  it('deletes exactly the rows past the boundary, and reports before it acts', async () => {
    const cardId = await insertCard();
    const expired = await insertAttempt(cardId, RETENTION_DAYS + 1);
    const onTheBoundary = await insertAttempt(cardId, RETENTION_DAYS);
    const recent = await insertAttempt(cardId, 1);

    // A dry run says what it would do and changes nothing.
    const dry = await purgeExpiredAttempts({ dryRun: true, now: NOW });
    expect(dry.candidates).toBe(1);
    expect(dry.deleted).toBe(0);
    const survivors = await db.select({ id: scanAttempts.id }).from(scanAttempts).where(eq(scanAttempts.cardId, cardId));
    expect(survivors.map((row) => row.id).sort()).toEqual([expired, onTheBoundary, recent].sort());

    // The real run takes the expired row and nothing else: a row written exactly 30 days
    // ago is still inside the window.
    const real = await purgeExpiredAttempts({ now: NOW });
    expect(real.candidates).toBe(1);
    expect(real.deleted).toBe(1);

    const remaining = await db
      .select({ id: scanAttempts.id })
      .from(scanAttempts)
      .where(eq(scanAttempts.cardId, cardId));
    expect(remaining.map((row) => row.id).sort()).toEqual([onTheBoundary, recent].sort());

    // And it is idempotent: a second run finds nothing.
    const again = await purgeExpiredAttempts({ now: NOW });
    expect(again.candidates).toBe(0);
    expect(again.deleted).toBe(0);

    await db.delete(scanAttempts).where(eq(scanAttempts.cardId, cardId));
  });
});
