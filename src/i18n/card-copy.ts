/**
 * What the card says, in every language the card carries.
 *
 * The card prints all of its languages at once — his mockup (2026-09-29) — because
 * the person who picks it up may not read the owner's language, and a card is the
 * one artefact that cannot ask which language you prefer.
 */
export interface CardPhrase {
  /** "Emergency contact", upper-cased for the heading. */
  title: string;
  /** "Scan", for the line above the QR. */
  scan: string;
  /** CJK needs a slightly larger size to read the same weight. */
  scale?: number;
}

import type { CardLanguage } from './languages';

/**
 * Typed against the language set on purpose: with `Record<string, …>`, adding a language
 * to `CARD_LANGUAGES` compiled happily while the artwork silently omitted it. The printed
 * card is the one artefact nobody can fix after the fact.
 */
export const CARD_PHRASES: Record<CardLanguage, CardPhrase> = {
  en: { title: 'EMERGENCY CONTACT', scan: 'SCAN' },
  es: { title: 'CONTACTO DE EMERGENCIA', scan: 'ESCANEAR' },
  fr: { title: "CONTACT D'URGENCE", scan: 'SCANNER' },
  zh: { title: '紧急联系人', scan: '扫描', scale: 1.28 },
  ru: { title: 'ЭКСТРЕННЫЙ КОНТАКТ', scan: 'СКАНИРОВАТЬ' },
};

/** The order the mockup prints them in: Latin first, then Cyrillic, then CJK. */
export const CARD_PHRASE_ORDER: readonly CardLanguage[] = ['en', 'es', 'fr', 'ru', 'zh'];

export function cardPhrasesFor(languages: readonly string[]): CardPhrase[] {
  const wanted = CARD_PHRASE_ORDER.filter((code) => languages.includes(code));
  const codes = wanted.length > 0 ? wanted : CARD_PHRASE_ORDER;
  return codes.map((code) => CARD_PHRASES[code]).filter((phrase): phrase is CardPhrase => Boolean(phrase));
}
