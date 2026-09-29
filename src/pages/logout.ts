import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';
import { forbidden, isSameOrigin, redirectWithCookies } from '@/lib/http';

/**
 * POST only: a GET logout would let any page sign the owner out with an
 * image tag. Revocation is server-side — the session row is deleted (§3).
 */
export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return forbidden();
  const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  return redirectWithCookies('/login', response);
};
