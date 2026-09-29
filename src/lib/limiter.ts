import { RateLimiterPostgres } from 'rate-limiter-flexible';
import { getSql } from '@/db/client';

/**
 * Rate-limit state lives in Postgres (D12): the counters survive redeploys and
 * work across replicas, with no Redis in v1.
 *
 * `rate-limiter-flexible`'s Postgres store expects a node-postgres client
 * (`query({ text, values }) -> { rows }`). Rather than ship a second database
 * driver and a second pool, this is a five-line adapter over the postgres.js
 * client the app already uses. The store's own SQL is untouched — including the
 * `INSERT … ON CONFLICT … RETURNING`, which is what makes the increment and the
 * decision a single atomic operation (§6).
 */
export interface LimiterOptions {
  /** Namespaces the counters; also the table's key prefix. */
  keyPrefix: string;
  /** Allowed attempts inside the window. */
  points: number;
  /** Window in seconds. */
  duration: number;
  /** Seconds to refuse once the points are gone (0 = no extra block). */
  blockDuration?: number;
}

function storeClient() {
  const sql = getSql();
  return {
    query: async ({ text, values }: { text: string; values?: unknown[] }) => ({
      rows: await sql.unsafe(text, (values ?? []) as never[]),
    }),
  };
}

export function createLimiter(options: LimiterOptions): RateLimiterPostgres {
  const limiter = new RateLimiterPostgres({
    storeClient: storeClient(),
    // The store infers the client kind from the constructor name; ours is a
    // plain object, so it is declared. `pool` means "hand me the client itself
    // and do not release it", which is exactly the adapter's behaviour.
    storeType: 'pool',
    tableName: 'rate_limits',
    keyPrefix: options.keyPrefix,
    points: options.points,
    duration: options.duration,
    blockDuration: options.blockDuration ?? 0,
    clearExpiredByTimeout: false,
  });

  // The table comes from migration 0002, so the store's asynchronous
  // `CREATE TABLE` has nothing left to do — but until it resolves the store
  // rejects every `consume()` with "Table is not created yet". `tableCreated`
  // is a public property of the store at runtime; its type definitions just do
  // not declare it, hence the cast.
  (limiter as unknown as { tableCreated: boolean }).tableCreated = true;
  return limiter;
}

/** Seconds a caller should wait, for a `Retry-After` header. */
export function retryAfterSeconds(msBeforeNext: number): number {
  return Math.max(1, Math.ceil(msBeforeNext / 1000));
}
