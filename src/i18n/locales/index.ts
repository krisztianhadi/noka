import type { CardLanguage } from '../languages';
import type { MessageKey } from '../keys';
import en from './en';
import es from './es';
import fr from './fr';
import ru from './ru';
import zh from './zh';

/**
 * Every locale, keyed by code. Adding a language is: one file, one import, one line in
 * `src/i18n/languages.ts`, and the parity test tells you what is still missing.
 */
export const MESSAGES: Record<CardLanguage, Record<MessageKey, string>> = { en, es, fr, zh, ru };
