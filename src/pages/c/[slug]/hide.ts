import type { APIRoute } from 'astro';
import { canonicalSlug } from '@/lib/responder';
import { LANG_COOKIE, VIEW_COOKIE, clearCookie } from '@/lib/view-cookie';

/**
 * "Hide now" (§15): clears the view cookie and the language cookie. Zero JS —
 * this is why the responder page can sit on a locked phone in a pocket.
 */
export const POST: APIRoute = ({ params }) => {
  const slug = canonicalSlug(params.slug ?? '');
  const path = `/c/${slug}`;
  const headers = new Headers({ location: path, 'cache-control': 'no-store' });
  headers.append('set-cookie', clearCookie(VIEW_COOKIE, path));
  headers.append('set-cookie', clearCookie(LANG_COOKIE, path));
  return new Response(null, { status: 303, headers });
};
