/**
 * The languages a contact actually speaks (§14.7, D17).
 *
 * Deliberately a *wider* list than the card's five print/UI languages: the
 * point is to tell a responder who they can talk to, and that has nothing to do
 * with which languages the card is printed in. Each code needs a label in the
 * five UI languages (src/i18n/catalogue.ts) — that is the cost of adding one,
 * so the list stays curated and `other` covers the rest.
 */
export const SPOKEN_LANGUAGES = [
  'en',
  'hu',
  'th',
  'zh',
  'ru',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ar',
  'ja',
  'other',
] as const;

export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];

export function isSpokenLanguage(value: string): value is SpokenLanguage {
  return (SPOKEN_LANGUAGES as readonly string[]).includes(value);
}

/** Keeps the owner's order, drops duplicates and anything not in the vocabulary. */
export function sanitizeSpokenLanguages(values: readonly string[]): SpokenLanguage[] {
  const seen = new Set<SpokenLanguage>();
  for (const value of values) {
    const code = value.trim().toLowerCase();
    if (isSpokenLanguage(code)) seen.add(code);
  }
  return [...seen];
}

