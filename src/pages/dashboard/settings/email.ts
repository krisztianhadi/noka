import type { APIRoute } from 'astro';
import { changeOwnerEmail } from '@/lib/auth';
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

  // Direct update, not `changeEmail`: that API insists on a verification email and
  // there is no mailer yet (ADR-023). `request` is unused now, kept for the origin check.
  const result = await changeOwnerEmail(locals.owner.id, newEmail);
  return result === 'ok' ? settingsBack('notice', 'email-changed') : settingsBack('error', 'email-taken');
};
