import type { APIRoute } from 'astro';
import { regenerateSlug } from '@/lib/cards';
import { forbidden, isSameOrigin } from '@/lib/http';
import { ownerRedirect } from '@/lib/dashboard';

/** A new QR: the old printed card stops working permanently (§15). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return ownerRedirect('/login');

  const result = await regenerateSlug(locals.owner.id);
  return ownerRedirect(result.ok ? '/dashboard/card?notice=slug-regenerated' : `/dashboard/card?error=${result.reason}`);
};
