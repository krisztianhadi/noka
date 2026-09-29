import type { APIRoute } from 'astro';
import { createContact } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';
import { composePhone } from '@/lib/phone';

/** Add a contact. The first thing an owner does, before any card exists. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const form = await readForm(request);
  if (!form) return forbidden();

  const result = await createContact(locals.owner.id, {
    name: field(form, 'name'),
    relation: field(form, 'relation'),
    phone: composePhone(field(form, 'country'), field(form, 'phone')),
    spokenLanguages: form.getAll('spoken').map(String),
    channels: form.getAll('channels').map(String),
    textOnly: form.get('text_only') === 'yes',
  });

  // The raw key travels in the URL; the dashboard resolves it to a sentence.
  return result.ok ? dashboardBack('notice', 'contact-added') : dashboardBack('error', result.error);
};
