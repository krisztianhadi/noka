import { primarySubtag, type CardLanguage } from './languages';

/**
 * Responder language negotiation (D19): `Accept-Language` ∩ the card's own
 * set, falling back to `languages[0]`.
 *
 * Pure functions — no request objects — so the whole matrix is unit-testable.
 */
export interface WeightedTag {
  tag: string;
  quality: number;
}

export function parseAcceptLanguage(header: string | null | undefined): WeightedTag[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...parameters] = part.split(';');
      let quality = 1;
      for (const parameter of parameters) {
        const [name = '', value = ''] = parameter.split('=');
        if (name.trim().toLowerCase() === 'q') {
          const parsed = Number.parseFloat(value.trim());
          if (Number.isFinite(parsed)) quality = parsed;
        }
      }
      return { tag: tag.trim(), quality };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Returns one of `allowed`. A wildcard or an unmatched header yields the
 * card's own default language, never an error.
 */
export function negotiateLanguage(
  header: string | null | undefined,
  allowed: readonly CardLanguage[],
): CardLanguage {
  const fallback = allowed[0] ?? 'en';
  if (allowed.length === 0) return 'en';

  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === '*') return fallback;
    const primary = primarySubtag(tag);
    const match = allowed.find((language) => language === primary);
    if (match) return match;
  }
  return fallback;
}
