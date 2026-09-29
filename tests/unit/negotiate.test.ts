import { describe, expect, it } from 'vitest';
import type { CardLanguage } from '@/i18n/languages';
import { negotiateLanguage, parseAcceptLanguage } from '@/i18n/negotiate';

const ALL: CardLanguage[] = ['en', 'es', 'fr', 'zh', 'ru'];
const RUSSIAN_FIRST: CardLanguage[] = ['ru', 'en'];

describe('parseAcceptLanguage', () => {
  it('orders by quality and keeps the tag', () => {
    expect(parseAcceptLanguage('en;q=0.4, ru;q=0.9, fr')).toEqual([
      { tag: 'fr', quality: 1 },
      { tag: 'ru', quality: 0.9 },
      { tag: 'en', quality: 0.4 },
    ]);
  });

  it('drops q=0 entries — an explicit refusal is not a match', () => {
    expect(parseAcceptLanguage('en;q=0, ru')).toEqual([{ tag: 'ru', quality: 1 }]);
  });

  it('treats an absent or empty header as no preference', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });

  it('ignores junk instead of throwing', () => {
    expect(parseAcceptLanguage(' , ;q=,ru')).toEqual([{ tag: 'ru', quality: 1 }]);
  });
});

describe('negotiateLanguage', () => {
  it('picks the highest-quality language the card offers', () => {
    expect(negotiateLanguage('en;q=0.3, fr;q=0.9', ALL)).toBe('fr');
  });

  it('matches a regional tag by its primary subtag', () => {
    expect(negotiateLanguage('en-GB,en;q=0.9', RUSSIAN_FIRST)).toBe('en');
    expect(negotiateLanguage('zh-Hans-CN', ALL)).toBe('zh');
  });

  it('falls back to the card default when nothing matches', () => {
    expect(negotiateLanguage('th-TH,th;q=0.9', RUSSIAN_FIRST)).toBe('ru');
    expect(negotiateLanguage('th-TH', ALL)).toBe('en');
  });

  it('uses the card default when there is no header at all', () => {
    expect(negotiateLanguage(undefined, RUSSIAN_FIRST)).toBe('ru');
    expect(negotiateLanguage(undefined, ALL)).toBe('en');
  });

  it('treats a wildcard as the card default, not as every language', () => {
    expect(negotiateLanguage('*', RUSSIAN_FIRST)).toBe('ru');
  });

  it('honours the order of the card set, which is the owner’s choice', () => {
    for (const allowed of [ALL, RUSSIAN_FIRST, ['zh', 'fr'] as CardLanguage[]]) {
      expect(negotiateLanguage('th', allowed)).toBe(allowed[0]);
    }
  });

  it('survives an empty set', () => {
    expect(negotiateLanguage('ru', [])).toBe('en');
  });
});
