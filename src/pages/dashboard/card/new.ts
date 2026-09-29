import type { APIRoute } from 'astro';
import { newCardForOwner } from '@/lib/cards';
import { dashboardBack } from '@/lib/dashboard';
import { forbidden, isSameOrigin } from '@/lib/http';

/**
 * A new slug **and** a new PIN in one action (his call, 2026-09-29): the previous
 * printed card stops resolving immediately, which is the whole point of the
 * button. Contacts and notes are untouched — they belong to the owner.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return dashboardBack('error', 'no-card');

  const result = await newCardForOwner(locals.owner.id);
  return result.ok ? dashboardBack('notice', 'card-renewed') : dashboardBack('error', result.reason);
};
