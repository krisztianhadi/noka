import type { APIRoute } from 'astro';
import { pingDb } from '@/db/client';

/** Railway healthcheck (railway.json). 503 when the database is unreachable. */
export const GET: APIRoute = async () => {
  const databaseUp = await pingDb();
  const body = {
    status: databaseUp ? 'ok' : 'degraded',
    database: databaseUp ? 'up' : 'down',
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    uptimeSeconds: Math.round(process.uptime()),
  };
  return new Response(JSON.stringify(body), {
    status: databaseUp ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
