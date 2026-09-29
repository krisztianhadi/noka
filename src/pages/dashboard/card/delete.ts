import type { APIRoute } from 'astro';
import { deleteCardForOwner } from '@/lib/cards';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * Delete the card. Contacts and notes stay — they belong to the owner, so losing a
 * card is only losing a link and a PIN. The browser confirms first.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'no-card');

  const deleted = await deleteCardForOwner(locals.owner.id);
  return deleted ? dashboardBack('notice', 'card-deleted') : dashboardBack('error', 'no-card');
};
