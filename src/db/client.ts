import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '@/config';
import * as schema from './schema';

/**
 * One lazily created pool per process. `prepare: false` keeps the driver
 * compatible with a transaction pooler (PgBouncer) on Railway as well as with
 * the local container.
 */
let sql: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!database) {
    sql = postgres(getConfig().DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
    database = drizzle(sql, { schema });
  }
  return database;
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
