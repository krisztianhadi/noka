import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getSql } from '@/db/client';
import { createLimiter, retryAfterSeconds } from '@/lib/limiter';

/**
 * Phase 0 spike, kept as a regression test: the increment and the decision must
 * be one atomic operation, or a burst of parallel guesses gets more than its
 * share (§6, D12).
 *
 * The interesting number is 50 — enough concurrency to lose updates if the
 * counter were read-then-written.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('rate limiter store', () => {
  const prefixes: string[] = [];

  function limiter(points: number, duration = 60) {
    const keyPrefix = `test-${randomUUID()}`;
    prefixes.push(keyPrefix);
    return createLimiter({ keyPrefix, points, duration });
  }

  afterAll(async () => {
    const sql = getSql();
    for (const keyPrefix of prefixes) {
      await sql`delete from rate_limits where key like ${`${keyPrefix}%`}`;
    }
    await closeDb();
  });

  it('allows exactly `points` of 50 concurrent attempts on one key', async () => {
    const points = 10;
    const durationSeconds = 60;
    const rl = limiter(points, durationSeconds);
    const key = `burst-${randomUUID()}`;

    // 50 parallel guesses at one card: the increment and the decision are one
    // atomic upsert, so more than `points` cannot get through.
    const burst = await Promise.allSettled(Array.from({ length: 50 }, () => rl.consume(key)));

    const allowed = burst.filter((entry) => entry.status === 'fulfilled').length;
    const refused = burst.filter((entry) => entry.status === 'rejected').length;

    expect(allowed).toBe(points);
    expect(refused).toBe(50 - points);

    // The store counts **every** attempt, allowed or refused — the counter is a
    // throttle, not a tally of allowances. Phase 6 must not read it as
    // "successful attempts" (see ADR-016).
    const state = await rl.get(key);
    expect(state?.consumedPoints).toBe(50);

    // The refusals carry a usable wait time inside the window, for Retry-After.
    const firstRefusal = burst.find((entry) => entry.status === 'rejected');
    if (firstRefusal?.status === 'rejected') {
      const ms = (firstRefusal.reason as { msBeforeNext?: number }).msBeforeNext ?? 0;
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(durationSeconds * 1000);
      expect(retryAfterSeconds(ms)).toBeGreaterThanOrEqual(1);
    }
  });

  it('counts per key, not globally', async () => {
    const rl = limiter(2);
    await rl.consume('key-a');
    await rl.consume('key-a');
    await expect(rl.consume('key-a')).rejects.toBeTruthy();

    // A different card is untouched by the first card's exhaustion.
    await expect(rl.consume('key-b')).resolves.toBeTruthy();
  });

  it('shares one counter between two instances, as two replicas would', async () => {
    const keyPrefix = `test-${randomUUID()}`;
    prefixes.push(keyPrefix);
    const replicaA = createLimiter({ keyPrefix, points: 3, duration: 60 });
    const replicaB = createLimiter({ keyPrefix, points: 3, duration: 60 });

    await replicaA.consume('shared');
    await replicaB.consume('shared');
    await replicaA.consume('shared');
    await expect(replicaB.consume('shared')).rejects.toBeTruthy();

    // Three allowed plus the one refused attempt that hit the same counter.
    const state = await replicaB.get('shared');
    expect(state?.consumedPoints).toBe(4);
  });

  it('does not extend the window when the limit keeps being hit', async () => {
    // A fixed window from the first attempt, so hammering cannot push the
    // owner's own retry time further and further away.
    const rl = limiter(1, 60);
    const key = `fixed-${randomUUID()}`;

    await expect(rl.consume(key)).resolves.toBeTruthy();
    const first = await rl.get(key);
    await expect(rl.consume(key)).rejects.toBeTruthy();
    await expect(rl.consume(key)).rejects.toBeTruthy();
    const later = await rl.get(key);

    expect(later?.msBeforeNext).toBeLessThanOrEqual(first?.msBeforeNext ?? 0);
  });

  it('forgets the counter once the window has passed', async () => {
    const rl = limiter(1, 1);
    await expect(rl.consume('window')).resolves.toBeTruthy();
    await expect(rl.consume('window')).rejects.toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(rl.consume('window')).resolves.toBeTruthy();
  });

  it('blocks for the configured duration once the points are gone, then releases', async () => {
    const rl = createLimiter({ keyPrefix: `test-${randomUUID()}`, points: 1, duration: 60, blockDuration: 1 });
    prefixes.push(rl.keyPrefix);

    await expect(rl.consume('blocked')).resolves.toBeTruthy();
    await expect(rl.consume('blocked')).rejects.toBeTruthy();

    const state = await rl.get('blocked');
    expect(state?.msBeforeNext).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(rl.consume('blocked')).resolves.toBeTruthy();
  });
});
