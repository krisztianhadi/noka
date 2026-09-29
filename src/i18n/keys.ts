import en from './locales/en';

/**
 * The message key set, derived from the English file so there is exactly one source of
 * truth (ADR-032).
 *
 * TypeScript enforces the rest: every other locale file is a `Record<MessageKey, string>`,
 * so a language that has not caught up cannot compile, and a translation that invents a key
 * fails too.
 */
export type MessageKey = keyof typeof en;
