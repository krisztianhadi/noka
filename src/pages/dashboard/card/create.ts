import type { APIRoute } from 'astro';
import { createCardForOwner } from '@/lib/cards';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/** Make the owner's card. Refused without a contact: the card needs someone to reach. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'no-card');

  const result = await createCardForOwner(locals.owner.id);
  return result.ok ? dashboardBack('notice', 'card-made') : dashboardBack('error', result.reason);
};
