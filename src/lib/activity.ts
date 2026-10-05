import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, type Executor } from '@/db/client';
import { cards, scanAttempts } from '@/db/schema';
import { RETENTION_DAYS, retentionCutoff } from '@/lib/retention';

/**
 * What the owner gets to see about their own card (PLAN §6, D25).
 *
 * The audit table is written on every PIN attempt and read by nobody: the limiter has its own
 * counter, and until now the rows existed only to be deleted after 30 days. This is the
 * reading side — the answer to "has anyone actually opened this card?" — and it is
 * deliberately small: counts, distinct networks, and the last few attempts.
 *
 * Three rules it obeys:
 *
 * - **Attribution.** Only attempts joined to a card this owner holds. A scan of an unknown
 *   slug writes a row with `card_id = NULL` (so the attempt is counted for the limiter and
 *   nothing else); those are nobody's rows and never appear here.
 * - **The window is the retention window.** Attempts older than 30 days are on their way out,
 *   so reporting them would show a number that drops for a reason the owner cannot see.
 *   Passing `now` is how the tests pin it.
 * - **Never an address.** The row holds an HMAC of the IP prefix, and the owner sees a short
 *   pseudonym derived from it: enough to tell "the same network twice" from "two networks",
 *   useless as an address (D26).
 */
export interface ActivityEvent {
  at: Date;
  success: boolean;
  /** Short, stable pseudonym for the network the attempt came from. */
  network: string | null;
}

export interface CardActivity {
  unlocks: number;
  failures: number;
  /** Distinct networks seen in the window, successful or not. */
  networks: number;
  lastUnlock: Date | null;
  events: ActivityEvent[];
  windowDays: number;
}

/** The part of the hash an owner sees. Not reversible without `IP_HASH_KEY`. */
export function networkTag(ipPrefixHash: string | null): string | null {
  return ipPrefixHash ? ipPrefixHash.slice(0, 6) : null;
}

/**
 * "3 hours ago", in the owner's language. `Intl` does the work rather than a hand-rolled
 * table, because the alternative is five languages' worth of plural rules for one line — the
 * mistake this project already made once with contact counts (ADR-032).
 */
export function relativeTime(at: Date, locale: string, now: Date = new Date()): string {
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
  ];

  let value = seconds;
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) return format.format(value, unit);
    value = Math.round(value / step);
  }
  return format.format(value, 'month');
}

export async function cardActivity(
  userId: string,
  options: { limit?: number; now?: Date; days?: number } = {},
  handle: Executor = getDb(),
): Promise<CardActivity> {
  const { limit = 8, now = new Date(), days = RETENTION_DAYS } = options;
  const since = retentionCutoff(now, days);

  const owned = and(eq(cards.userId, userId), gte(scanAttempts.createdAt, since));

  const [totals] = await handle
    .select({
      unlocks: sql<number>`count(*) filter (where ${scanAttempts.success})`.mapWith(Number),
      failures: sql<number>`count(*) filter (where not ${scanAttempts.success})`.mapWith(Number),
      networks: sql<number>`count(distinct ${scanAttempts.ipPrefixHash})`.mapWith(Number),
      lastUnlock: sql<Date | null>`max(${scanAttempts.createdAt}) filter (where ${scanAttempts.success})`,
    })
    .from(scanAttempts)
    .innerJoin(cards, eq(scanAttempts.cardId, cards.id))
    .where(owned);

  const rows = await handle
    .select({
      at: scanAttempts.createdAt,
      success: scanAttempts.success,
      ipPrefixHash: scanAttempts.ipPrefixHash,
    })
    .from(scanAttempts)
    .innerJoin(cards, eq(scanAttempts.cardId, cards.id))
    .where(owned)
    .orderBy(desc(scanAttempts.createdAt))
    .limit(limit);

  return {
    unlocks: totals?.unlocks ?? 0,
    failures: totals?.failures ?? 0,
    networks: totals?.networks ?? 0,
    lastUnlock: totals?.lastUnlock ? new Date(totals.lastUnlock) : null,
    events: rows.map((row) => ({ at: row.at, success: row.success, network: networkTag(row.ipPrefixHash) })),
    windowDays: days,
  };
}
