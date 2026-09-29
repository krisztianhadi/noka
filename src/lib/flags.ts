/**
 * Flags for languages, for the places a person scans rather than reads.
 *
 * Two vocabularies use them: the card's own print languages (EN / ES / FR / ZH / RU) and
 * the wider set of languages a contact may speak. A flag is not a language — English is
 * not only Britain, Spanish is not only Spain — so this is decoration beside a written
 * label, never the label itself.
 *
 * Emoji, not images: no request, no sprite, no asset to keep in sync (the responder
 * page fetches nothing at all). The honest caveat is that Windows has no flag-emoji
 * font, where these degrade to letter pairs like `TH` — still readable, since the
 * written language name sits next to every one of them.
 */
const LANGUAGE_FLAGS: Record<string, string> = {
  ar: '🇸🇦',
  de: '🇩🇪',
  en: '🇬🇧',
  es: '🇪🇸',
  fa: '🇮🇷',
  fr: '🇫🇷',
  he: '🇮🇱',
  hi: '🇮🇳',
  hu: '🇭🇺',
  id: '🇮🇩',
  it: '🇮🇹',
  ja: '🇯🇵',
  km: '🇰🇭',
  ko: '🇰🇷',
  lo: '🇱🇦',
  ms: '🇲🇾',
  my: '🇲🇲',
  nl: '🇳🇱',
  pl: '🇵🇱',
  pt: '🇵🇹',
  ro: '🇷🇴',
  ru: '🇷🇺',
  th: '🇹🇭',
  tr: '🇹🇷',
  uk: '🇺🇦',
  vi: '🇻🇳',
  zh: '🇨🇳',
};

/** A language with no flag of its own gets a neutral globe rather than a wrong country. */
export function flagForLanguage(code: string): string {
  return LANGUAGE_FLAGS[primarySubtagOf(code)] ?? '🌐';
}

/** `zh-Hans` → `zh`, so a script-tagged language still finds its flag. */
function primarySubtagOf(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}
