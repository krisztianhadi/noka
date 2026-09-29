/**
 * The card's language set (D15, D19). One ordered array drives both the
 * printed instructions and the responder pages — a card cannot be printed in
 * a language its own page cannot speak.
 *
 * The first entry is the fallback when `Accept-Language` matches nothing.
 */
export const CARD_LANGUAGES = ['en', 'es', 'fr', 'zh', 'ru'] as const;

export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export const DEFAULT_CARD_LANGUAGES: readonly CardLanguage[] = CARD_LANGUAGES;

export interface LanguageInfo {
  /** The name in the language itself, so a speaker finds it whatever the UI language is. */
  endonym: string;
  /** English name, for the dashboard and logs. */
  englishName: string;
  /** Value for the <html lang> attribute. */
  htmlLang: string;
  /**
   * Writing direction for the `<html dir>` attribute. Every shipped language is `ltr`;
   * the field exists so adding Arabic, Hebrew or Farsi is a metadata change rather than a
   * layout archaeology project (ADR-032).
   */
  dir: 'ltr' | 'rtl';
}

export const LANGUAGE_INFO: Record<CardLanguage, LanguageInfo> = {
  en: { dir: 'ltr', endonym: 'English', englishName: 'English', htmlLang: 'en' },
  es: { dir: 'ltr', endonym: 'Español', englishName: 'Spanish', htmlLang: 'es' },
  fr: { dir: 'ltr', endonym: 'Français', englishName: 'French', htmlLang: 'fr' },
  zh: { dir: 'ltr', endonym: '中文', englishName: 'Chinese', htmlLang: 'zh-Hans' },
  ru: { dir: 'ltr', endonym: 'Русский', englishName: 'Russian', htmlLang: 'ru' },
};

export function isCardLanguage(value: string): value is CardLanguage {
  return (CARD_LANGUAGES as readonly string[]).includes(value);
}

/** ISO 639 subtag lookup: `en-GB` -> `en`, `zh-Hans-CN` -> `zh`. */
export function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split('-')[0] ?? '';
}

/** The card's set, order preserved, filtered to codes we support. */
export function sanitizeLanguageSet(values: readonly string[]): CardLanguage[] {
  const seen = new Set<CardLanguage>();
  for (const value of values) {
    const primary = primarySubtag(value);
    if (isCardLanguage(primary)) seen.add(primary);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_CARD_LANGUAGES];
}
