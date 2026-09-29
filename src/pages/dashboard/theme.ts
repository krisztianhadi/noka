import type { APIRoute } from 'astro';
import { forbidden, isSameOrigin, readForm } from '@/lib/http';
import { ownerRedirect } from '@/lib/dashboard';
import { readTheme, THEME_COOKIE, THEME_COOKIE_OPTIONS } from '@/lib/theme';

/**
 * Theme is a cookie, not client state: the server render already knows it, so
 * there is no flash of the wrong colours and nothing to hydrate.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return forbidden();

  const form = await readForm(request);
  const theme = readTheme(form ? String(form.get('theme') ?? '') : '');
  if (theme) cookies.set(THEME_COOKIE, theme, THEME_COOKIE_OPTIONS);

  return ownerRedirect('/dashboard');
};
