import type { APIRoute } from 'astro';
import { createCardForOwner } from '@/lib/cards';
import { createContact, setNotes } from '@/lib/contacts';
import { dashboardBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';
import { composePhone } from '@/lib/phone';

/**
 * First run: the first contact and the note, saved by one button.
 *
 * Contact details and a note are two tables, so this is two writes — but the owner wrote
 * one form, so it is one request and one failure. The contact is created first: if it fails,
 * the note is not written either, and the message says which field to fix.
 *
 * The card comes with the first contact: a card with nobody behind it is not a thing, and
 * asking for a second press to create what the first press already implied was a step to
 * explain rather than a step to take.
 */
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

  if (!result.ok) return dashboardBack('error', result.error);

  // The note is optional: an empty box is not an error, and it is not a note either.
  const notes = field(form, 'notes').trim();
  if (notes) await setNotes(locals.owner.id, notes);

  // Idempotent: it returns the existing card if there is one, so a retry cannot mint a second.
  const card = await createCardForOwner(locals.owner.id);
  if (!card.ok) return dashboardBack('error', card.reason);

  return dashboardBack('notice', 'started');
};
