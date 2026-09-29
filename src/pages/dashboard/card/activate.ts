import type { APIRoute } from 'astro';
import { setCardActive } from '@/lib/cards';
import { forbidden, isSameOrigin } from '@/lib/http';
import { ownerRedirect } from '@/lib/dashboard';

/**
 * Activation is gated on having a contact (D28), so a fresh account is told
 * why rather than being handed a card that leads nowhere.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return ownerRedirect('/login');

  const result = await setCardActive(locals.owner.id, true);
  return ownerRedirect(result.ok ? '/dashboard/card?notice=activated' : `/dashboard/card?error=${result.reason}`);
};
