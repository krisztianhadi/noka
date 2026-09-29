import type { APIRoute } from 'astro';
import { setCardActive } from '@/lib/cards';
import { forbidden, isSameOrigin } from '@/lib/http';
import { ownerRedirect } from '@/lib/dashboard';

/**
 * Deactivating stops the guest URL **and** the print/download endpoints (D9).
 * It is always allowed, contacts or not.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return ownerRedirect('/login');

  const result = await setCardActive(locals.owner.id, false);
  return ownerRedirect(result.ok ? '/dashboard/card?notice=deactivated' : `/dashboard/card?error=${result.reason}`);
};
