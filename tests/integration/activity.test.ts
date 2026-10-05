import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { scanAttempts } from '@/db/schema';
import { cardActivity, networkTag } from '@/lib/activity';
import { RETENTION_DAYS } from '@/lib/retention';
import { insertOwnerWithCard } from './fixtures';

/**
 * The reading side of the audit table (PLAN §6). Three contracts, and each one has a way to
 * be quietly wrong:
 *
 * - **the counts** — successes and failures are counted separately, and a scan of an unknown
 *   slug (which writes `card_id = NULL`) is not attributed to anyone;
 * - **the window** — the report uses the same 30 days as retention, so the number it shows
 *   does not drop because a row aged out unannounced;
 * - **the owner's own rows only** — a second account's attempts must not appear in the first
 *   account's numbers, which is the one that would be a real leak.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const NOW = new Date('2026-10-05T12:00:00Z');

describeDb('card activity', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  async function owner() {
    const fixture = await insertOwnerWithCard(db);
    createdUserIds.push(fixture.userId);
    return fixture;
  }

  async function attempt(
    cardId: string,
    options: { success?: boolean; hash?: string; daysAgo?: number; at?: Date } = {},
  ) {
    const { success = false, hash = 'aaaaaa111111', daysAgo = 0 } = options;
    const createdAt = options.at ?? new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    await db.insert(scanAttempts).values({
      cardId,
      kind: success ? 'pin_success' : 'pin_fail',
      success,
      ipPrefixHash: hash,
      createdAt,
    });
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('counts unlocks, failures and networks inside the retention window', async () => {
    const mine = await owner();
    await attempt(mine.cardId, { success: true, hash: 'aaaaaa111111', daysAgo: 1 });
    await attempt(mine.cardId, { success: true, hash: 'bbbbbb222222', daysAgo: 2 });
    await attempt(mine.cardId, { hash: 'aaaaaa111111', daysAgo: 3 });
    await attempt(mine.cardId, { hash: 'cccccc333333', daysAgo: 4 });

    const activity = await cardActivity(mine.userId, { now: NOW });

    expect(activity.unlocks).toBe(2);
    expect(activity.failures).toBe(2);
    // Two attempts came from the same network: distinct, not a row count.
    expect(activity.networks).toBe(3);
    expect(activity.windowDays).toBe(RETENTION_DAYS);
    expect(activity.lastUnlock?.toISOString()).toBe('2026-10-04T12:00:00.000Z');

    // Newest first, and the pseudonym is stable per network.
    expect(activity.events.map((event) => event.network)).toEqual([
      'aaaaaa',
      'bbbbbb',
      'aaaaaa',
      'cccccc',
    ]);
    expect(activity.events[0]?.success).toBe(true);
  });

  it('ignores rows past the retention window', async () => {
    const mine = await owner();
    await attempt(mine.cardId, { hash: 'dddddd444444', daysAgo: RETENTION_DAYS + 1 });
    await attempt(mine.cardId, { hash: 'eeeeee555555', daysAgo: RETENTION_DAYS - 1 });

    const activity = await cardActivity(mine.userId, { now: NOW });

    expect(activity.unlocks).toBe(0);
    expect(activity.failures).toBe(1);
    expect(activity.networks).toBe(1);
  });

  it('never attributes an unknown-slug attempt to an owner', async () => {
    const mine = await owner();
    await attempt(mine.cardId, { hash: 'ffffff666666' });
    // What a scan of a slug that matches nothing writes: no card, nobody to bill it to.
    await db.insert(scanAttempts).values({
      cardId: null,
      kind: 'pin_fail',
      success: false,
      ipPrefixHash: 'ffffff666666',
      createdAt: NOW,
    });

    const activity = await cardActivity(mine.userId, { now: NOW });

    expect(activity.failures).toBe(1);
    expect(activity.networks).toBe(1);
  });

  it("keeps another owner's attempts out of the numbers", async () => {
    const mine = await owner();
    const theirs = await owner();
    await attempt(mine.cardId, { success: true, hash: 'aaaaaa111111' });
    await attempt(theirs.cardId, { success: true, hash: 'bbbbbb222222' });
    await attempt(theirs.cardId, { hash: 'bbbbbb222222' });
    await attempt(theirs.cardId, { hash: 'cccccc333333' });

    const activity = await cardActivity(mine.userId, { now: NOW });

    expect(activity.unlocks).toBe(1);
    expect(activity.failures).toBe(0);
    expect(activity.networks).toBe(1);
  });

  it('reports nothing, and says so, for a card nobody has touched', async () => {
    const mine = await owner();
    const activity = await cardActivity(mine.userId, { now: NOW });

    expect(activity).toMatchObject({ unlocks: 0, failures: 0, networks: 0, lastUnlock: null });
    expect(activity.events).toEqual([]);
  });

  it('shows a pseudonym, not the stored hash', () => {
    expect(networkTag('0123456789abcdef')).toBe('012345');
    expect(networkTag(null)).toBeNull();
  });
});
