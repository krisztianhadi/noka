import type { APIRoute } from 'astro';
import { canonicalSlug } from '@/lib/responder';
import { LANG_COOKIE, VIEW_COOKIE, clearCookie } from '@/lib/view-cookie';

/**
 * "Exit": clears the view cookie and the language cookie, so a phone that was handed over —
 * or left unlocked on a table — stops showing the contacts immediately. Zero JavaScript, like
 * everything else on this plane: it is a form post and a redirect.
 */
export const POST: APIRoute = ({ params }) => {
  const slug = canonicalSlug(params.slug ?? '');
  const path = `/c/${slug}`;
  const headers = new Headers({ location: path, 'cache-control': 'no-store' });
  headers.append('set-cookie', clearCookie(VIEW_COOKIE, path));
  headers.append('set-cookie', clearCookie(LANG_COOKIE, path));
  return new Response(null, { status: 303, headers });
};
