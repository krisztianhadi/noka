import type { APIRoute } from 'astro';
import { changeOwnerEmail, verifyOwnerPassword } from '@/lib/auth';
import { settingsBack } from '@/lib/dashboard';
import { field, forbidden, isSameOrigin, readForm } from '@/lib/http';

/** Change the account email. The library applies it directly (no verification flow yet). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return settingsBack('error', 'not-signed-in');

  const form = await readForm(request);
  if (!form) return forbidden();

  const newEmail = field(form, 'email').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) return settingsBack('error', 'email-invalid');
  if (newEmail === locals.owner.email) return settingsBack('notice', 'email-unchanged');

  // The email is the account's only recovery channel, so changing it needs the password — the
  // same lock as the password form. A stolen session could otherwise redirect the account and
  // quietly lock the owner out of their own recovery.
  const password = field(form, 'current_password');
  if (!(await verifyOwnerPassword(locals.owner.id, password))) {
    return settingsBack('error', 'password-wrong');
  }

  // Direct update, not `changeEmail`: that API insists on a verification email and
  // there is no mailer yet (ADR-023). `request` is unused now, kept for the origin check.
  const result = await changeOwnerEmail(locals.owner.id, newEmail);
  return result === 'ok' ? settingsBack('notice', 'email-changed') : settingsBack('error', 'email-taken');
};
