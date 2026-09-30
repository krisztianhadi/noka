import type { APIRoute } from 'astro';
import { setNotes } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/** Delete the note. The card page then shows contacts only. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  await setNotes(locals.owner.id, '');
  return dashboardBack('notice', 'notes-deleted');
};
