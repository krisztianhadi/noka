import type { APIRoute } from 'astro';
import { rotatePin } from '@/lib/cards';
import { forbidden, isSameOrigin } from '@/lib/http';
import { ownerRedirect } from '@/lib/dashboard';

/**
 * A new PIN bumps `pin_version`, so every live view cookie dies (§15).
 * POST-only, origin-checked: this is a state change, not a link.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return forbidden();
  if (!locals.owner) return ownerRedirect('/login');

  const result = await rotatePin(locals.owner.id);
  return ownerRedirect(result.ok ? '/dashboard/card?notice=pin-rotated' : `/dashboard/card?error=${result.reason}`);
};
