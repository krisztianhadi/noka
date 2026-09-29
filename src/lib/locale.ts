import { CARD_LANGUAGES, isCardLanguage, type CardLanguage } from '@/i18n/languages';
import { negotiateLanguage } from '@/i18n/negotiate';

/**
 * The owner plane's language: what the person chose, else what their device asked for,
 * else English (ADR-032).
 *
 * The owner plane offers the same language set as the card pages, so one catalogue serves
 * both and a translator has one file to fill. The choice is a cookie rather than a column:
 * it is a display preference, it must survive a signed-out visit to the landing page, and
 * losing it costs nothing.
 */
export const LOCALE_COOKIE = 'noka_lang';
export const LOCALE_TTL_SECONDS = 60 * 60 * 24 * 365;

export function resolveOwnerLocale(
  cookie: string | undefined | null,
  acceptLanguage: string | null | undefined,
): CardLanguage {
  if (cookie && isCardLanguage(cookie)) return cookie;
  // Same negotiation as the card pages, so a phone set to Spanish gets Spanish here too.
  return negotiateLanguage(acceptLanguage, CARD_LANGUAGES);
}
