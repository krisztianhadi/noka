import { lt } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { scanAttempts } from '@/db/schema';

/**
 * Retention (D24, §11): the scan audit trail is kept for 30 days, then deleted.
 *
 * It is the only table that grows on its own — every PIN attempt writes a row — and it
 * holds the most sensitive metadata in the schema (an HMAC'd IP prefix). The purge runs
 * from the Railway cron service, never over HTTP, so there is no admin surface to
 * protect.
 *
 * The deletion lives here rather than inside the script so the boundary can be tested
 * against the real database: "30 days" is exactly the kind of claim a privacy policy
 * makes and nobody checks.
 */
export const RETENTION_DAYS = 30;

export interface PurgeResult {
  /** Rows older than the cutoff. */
  candidates: number;
  /** Rows actually removed (0 for a dry run). */
  deleted: number;
  /** The instant used as the boundary, for logging. */
  cutoff: Date;
}

export function retentionCutoff(now = new Date(), days = RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredAttempts(options: { dryRun?: boolean; now?: Date; days?: number } = {}): Promise<PurgeResult> {
  const { dryRun = false, now = new Date(), days = RETENTION_DAYS } = options;
  const cutoff = retentionCutoff(now, days);
  const db = getDb();

  const doomed = await db
    .select({ id: scanAttempts.id })
    .from(scanAttempts)
    .where(lt(scanAttempts.createdAt, cutoff));

  if (dryRun || doomed.length === 0) {
    return { candidates: doomed.length, deleted: 0, cutoff };
  }

  // One statement, bounded by the same cutoff the count used, so a row written while
  // this runs is never taken.
  const removed = await db.delete(scanAttempts).where(lt(scanAttempts.createdAt, cutoff)).returning({ id: scanAttempts.id });
  return { candidates: doomed.length, deleted: removed.length, cutoff };
}
