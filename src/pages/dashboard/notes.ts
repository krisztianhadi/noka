import type { APIRoute } from 'astro';
import { setNotes } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const form = await readForm(request);
  if (!form) return forbidden();

  await setNotes(locals.owner.id, field(form, 'notes'));
  return dashboardBack('notice', 'notes-saved');
};
