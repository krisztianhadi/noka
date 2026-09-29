import type { APIRoute } from 'astro';
import { DEFAULT_CARD_LANGUAGES, type CardLanguage } from '@/i18n/languages';
import { readForm } from '@/lib/http';
import { canonicalSlug, cardLanguages, findCardBySlug, viewCookieStillValid } from '@/lib/responder';
import { LANG_COOKIE, VIEW_COOKIE, readViewToken, serializeCookie } from '@/lib/view-cookie';

/**
 * Language switch (D19): a POST, never a query string, because a card URL must
 * not carry parameters into logs.
 *
 * An unknown or deactivated card behaves like a locked one — the cookie may be
 * set, and the redirect goes to the PIN form either way, so nothing here is an
 * existence oracle.
 */
export const POST: APIRoute = async ({ request, params, cookies }) => {
  const slug = canonicalSlug(params.slug ?? '');
  const card = await findCardBySlug(slug);
  const form = await readForm(request);
  const requested = String(form?.get('lang') ?? '').trim().toLowerCase();

  const offered: CardLanguage[] = card ? cardLanguages(card) : [...DEFAULT_CARD_LANGUAGES];
  const headers = new Headers({ 'cache-control': 'no-store' });

  if ((offered as string[]).includes(requested)) {
    headers.append('set-cookie', serializeCookie(LANG_COOKIE, requested, { path: `/c/${slug}` }));
  }

  const unlocked = viewCookieStillValid(readViewToken(cookies.get(VIEW_COOKIE)?.value), card);
  headers.set('location', unlocked ? `/c/${slug}/view` : `/c/${slug}`);
  return new Response(null, { status: 303, headers });
};
