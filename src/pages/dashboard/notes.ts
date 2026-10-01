import type { APIRoute } from 'astro';
import { MAX_NOTES_LENGTH, setNotes } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const form = await readForm(request);
  if (!form) return forbidden();

  const notes = field(form, 'notes');
  // A cap in the service rather than only in the textarea: a direct POST used to store whatever
  // it liked, encrypted, and the responder page paid for it.
  if (notes.trim().length > MAX_NOTES_LENGTH) return dashboardBack('error', 'notes-too-long');

  await setNotes(locals.owner.id, notes);
  return dashboardBack('notice', 'notes-saved');
};
