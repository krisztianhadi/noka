import type { APIRoute } from 'astro';
import { isCardLanguage } from '@/i18n/languages';
import { forbidden, isSameOrigin } from '@/lib/http';
import { LOCALE_COOKIE, LOCALE_TTL_SECONDS } from '@/lib/locale';

/**
 * Choose the owner plane's language.
 *
 * A cookie and a redirect back to where the choice was made. The `next` value is a path on
 * this site or nothing — accepting a full URL here would make the endpoint an open redirect,
 * which is the classic way a language switcher becomes a phishing tool.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return forbidden();

  const form = await request.formData();
  const language = String(form.get('lang') ?? '');
  if (!isCardLanguage(language)) return new Response('Unknown language', { status: 400 });

  cookies.set(LOCALE_COOKIE, language, {
    path: '/',
    maxAge: LOCALE_TTL_SECONDS,
    httpOnly: false,
    sameSite: 'lax',
  });

  const requested = String(form.get('next') ?? '/');
  const safe = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
  return new Response(null, { status: 303, headers: { location: safe, 'cache-control': 'no-store' } });
};
