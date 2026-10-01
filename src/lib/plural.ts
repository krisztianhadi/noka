import { t, type MessageKey } from '@/i18n/catalogue';
import type { CardLanguage } from '@/i18n/languages';

/**
 * Counted text, chosen by the language's own plural rules.
 *
 * The dashboard used to pick between `.one` and `.many` by hand, which cannot express Russian:
 * 1 → "1 контакт" (one), 3 → "3 контакта" (few), 5 → "5 контактов" (many), and the hand-picked
 * form was wrong for most numbers. `Intl.PluralRules` knows the categories, and every locale file
 * provides the ones its language actually uses.
 *
 * Only the categories a language has need text; a missing one falls back to `other`, which every
 * language has, so a half-translated plural is a plain sentence rather than a crash.
 */
export function plural(
  locale: CardLanguage,
  family: string,
  count: number,
  values: Record<string, string | number> = {},
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const key = `${family}.${category}` as MessageKey;
  const fallback = `${family}.other` as MessageKey;
  const filled = { count, ...values };
  // `t` returns undefined for a key a locale file does not carry, so the fallback is checked
  // rather than caught: a language with fewer plural forms than the catalogue is normal.
  const chosen = t(locale, key, filled) as string | undefined;
  return chosen ?? t(locale, fallback, filled);
}
