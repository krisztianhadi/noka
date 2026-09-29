import type { APIRoute } from 'astro';
import { exportOwnerData } from '@/lib/account';

/**
 * Download everything the account holds, as JSON (portability, Art. 20).
 *
 * `no-store`: the file contains the card's PIN and the decrypted contacts, so it must not
 * sit in a browser cache or a proxy.
 */
export const GET: APIRoute = async ({ locals }) => {
  const owner = locals.owner;
  if (!owner) return new Response('Not signed in', { status: 401 });

  const data = await exportOwnerData(owner.id);
  if (!data) return new Response('Not found', { status: 404 });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="noka-export-${date}.json"`,
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
};
