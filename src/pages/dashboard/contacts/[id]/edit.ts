import type { APIRoute } from 'astro';
import { getContact, updateContact } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';
import { composePhone } from '@/lib/phone';

export const POST: APIRoute = async ({ request, locals, params }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'not-found');

  const id = params.id ?? '';
  if (!(await getContact(locals.owner.id, id))) return dashboardBack('error', 'not-found');

  const form = await readForm(request);
  if (!form) return forbidden();

  const result = await updateContact(locals.owner.id, id, {
    name: field(form, 'name'),
    relation: field(form, 'relation'),
    phone: composePhone(field(form, 'country'), field(form, 'phone')),
    spokenLanguages: form.getAll('spoken').map(String),
    channels: form.getAll('channels').map(String),
  });

  return result.ok ? dashboardBack('notice', 'contact-updated') : dashboardBack('error', result.error);
};
