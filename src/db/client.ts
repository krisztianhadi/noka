import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '@/config';
import * as authSchema from './auth-schema';
import * as schema from './schema';

/** Our tables plus better-auth's, so one adapter sees everything. */
const fullSchema = { ...schema, ...authSchema };

/**
 * One lazily created pool per process. `prepare: false` keeps the driver
 * compatible with a transaction pooler (PgBouncer) on Railway as well as with
 * the local container.
 */
let sql: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<typeof fullSchema> | undefined;

/**
 * Anything that can run a query: the pool, or a transaction on it.
 *
 * Services take one of these as their last parameter instead of calling `getDb()` themselves, so
 * a caller that needs several reads to agree — the data export, the last-contact deletion — can
 * pass its transaction in and get one consistent view. A service that ignores it still works;
 * it just reads outside the caller's snapshot.
 */
export type Executor = Pick<
  PostgresJsDatabase<typeof fullSchema>,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

export function getDb(): PostgresJsDatabase<typeof fullSchema> {
  if (!database) {
    sql = postgres(getConfig().DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
    database = drizzle(sql, { schema: fullSchema });
  }
  return database;
}

/** The raw postgres.js client — the rate limiter's store needs it (D12). */
export function getSql(): ReturnType<typeof postgres> {
  getDb();
  return sql as ReturnType<typeof postgres>;
}

/** True when the database answers a trivial query — used by /healthz. */
export async function pingDb(): Promise<boolean> {
  try {
    await getDb().execute('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await sql?.end();
  sql = undefined;
  database = undefined;
}

export { schema };