import type { APIRoute } from 'astro';
import { getCardForOwner } from '@/lib/cards';
import { deleteContact } from '@/lib/contacts';
import { ownerRedirect } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * POST-only, origin-checked, and refused while the card is active and this is
 * the last contact (D28).
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return ownerRedirect('/login');

  const card = await getCardForOwner(locals.owner.id);
  if (!card) return ownerRedirect('/dashboard/card');

  const result = await deleteContact(card.id, params.id ?? '', { cardActive: card.active });
  return ownerRedirect(
    result.ok ? '/dashboard/contacts?notice=deleted' : `/dashboard/contacts?error=${result.error}`,
  );
};
