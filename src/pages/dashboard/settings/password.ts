import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';
import { ownerRedirect, settingsBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';

/**
 * Change the password. This **ends the sessions**, the current one included — the
 * safe direction, since a password change is usually a response to "someone else
 * may have it". The owner is sent to sign in again with the new one.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return settingsBack('error', 'not-signed-in');

  const form = await readForm(request);
  if (!form) return forbidden();

  const currentPassword = field(form, 'current_password');
  const newPassword = field(form, 'new_password');
  const confirmation = field(form, 'new_password_confirm');

  if (newPassword.length < 10) return settingsBack('error', 'password-too-short');
  if (newPassword !== confirmation) return settingsBack('error', 'password-mismatch');

  try {
    await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: request.headers,
    });
    return ownerRedirect('/login?notice=password-changed');
  } catch {
    return settingsBack('error', 'password-wrong');
  }
};
