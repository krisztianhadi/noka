#!/usr/bin/env node
/**
 * Retention purge (D24): delete scan audit rows older than 30 days.
 *
 *     pnpm purge --dry-run     # say what would go, delete nothing
 *     pnpm purge               # the cron service runs it this way
 *
 * No HTTP endpoint and no admin surface: it is a Railway cron service, so the only way
 * to trigger it is to be able to run a command on the host.
 */
import { closeDb } from '../src/db/client.ts';
import { purgeExpiredAttempts, RETENTION_DAYS } from '../src/lib/retention.ts';

const dryRun = process.argv.includes('--dry-run');

try {
  const result = await purgeExpiredAttempts({ dryRun });
  const verb = dryRun ? 'would delete' : 'deleted';
  console.log(
    `retention: ${result.candidates} row(s) older than ${RETENTION_DAYS} days (before ${result.cutoff.toISOString()}); ${verb} ${result.deleted}`,
  );
} finally {
  await closeDb();
}
