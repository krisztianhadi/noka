import type { CardLanguage } from './languages';
import { MESSAGES } from './locales';
import type { MessageKey } from './keys';

/**
 * Message lookup (D20, ADR-032). The messages themselves live in one file per language
 * under `src/i18n/locales/`; this module is only the accessor.
 *
 * Nothing here is the owner's own wording: names, notes and everything else the owner
 * typed stays exactly as typed (D19).
 *
 * `t` is total by construction: the key set comes from the English file and every locale is
 * a full `Record` of it, so a missing translation cannot reach a page.
 */
export { MESSAGES };
export type { MessageKey };

/**
 * Look one message up, filling `{placeholders}` when values are given.
 *
 * Placeholders rather than concatenation, because word order is not universal: a
 * translator needs to be able to move `{name}` to wherever their language puts it.
 */
export function t(
  language: CardLanguage,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  const message = MESSAGES[language][key];
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
