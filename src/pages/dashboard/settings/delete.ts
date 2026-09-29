import type { APIRoute } from 'astro';
import { deleteOwnerAccount } from '@/lib/account';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * Delete the account and everything in it (erasure, Art. 17).
 *
 * POST only, same-origin only, and behind a confirmation that says what is lost. The
 * session goes with it — the row it points at is gone — so the response clears the cookie
 * rather than leaving the browser holding a session the database has never heard of.
 */
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return new Response(null, { status: 303, headers: { location: '/' } });

  await deleteOwnerAccount(locals.owner.id);

  // Same name better-auth uses, plus the prefixed form it uses over HTTPS.
  for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) {
    cookies.delete(name, { path: '/' });
  }

  return new Response(null, {
    status: 303,
    headers: { location: '/?deleted=1', 'cache-control': 'no-store' },
  });
};
