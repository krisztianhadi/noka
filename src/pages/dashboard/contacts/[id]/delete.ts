import type { APIRoute } from 'astro';
import { getCardForOwner } from '@/lib/cards';
import { deleteContact } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * POST-only, origin-checked, and refused while a card exists and this is the last
 * contact: a printed card that leads to an empty page is worse than no card.
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const card = await getCardForOwner(locals.owner.id);
  const result = await deleteContact(locals.owner.id, params.id ?? '', { hasCard: card !== null });

  return result.ok ? dashboardBack('notice', 'contact-deleted') : dashboardBack('error', result.error);
};
