import type { APIRoute } from 'astro';
import { changeOwnerName, MAX_OWNER_NAME_LENGTH } from '@/lib/auth';
import { settingsBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';

/**
 * Change the owner's first name.
 *
 * No password: the name is not a recovery channel and not a credential — it is the line a
 * responder reads above the contacts. An empty value is accepted, because "no name" is a real
 * choice (the page falls back to "Emergency contacts", D27), so the only refusal here is a name
 * longer than the ceiling.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return settingsBack('error', 'not-signed-in');

  const form = await readForm(request);
  if (!form) return forbidden();

  const name = field(form, 'name').trim();
  if (name.length > MAX_OWNER_NAME_LENGTH) return settingsBack('error', 'name-too-long');
  if (name === locals.owner.name) return settingsBack('notice', 'name-unchanged');

  await changeOwnerName(locals.owner.id, name);
  return settingsBack('notice', 'name-changed');
};
