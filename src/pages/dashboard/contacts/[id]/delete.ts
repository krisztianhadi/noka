import type { APIRoute } from 'astro';
import { deleteContact } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * POST-only and origin-checked. Deleting the last contact also deletes the card —
 * the browser confirms first, and says so in the confirmation.
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const result = await deleteContact(locals.owner.id, params.id ?? '');
  if (!result.ok) return dashboardBack('error', result.error);

  return dashboardBack('notice', result.cardDeleted ? 'contact-and-card-deleted' : 'contact-deleted');
};
