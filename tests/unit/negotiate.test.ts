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

  it('falls back to English when the device language is not on the card', () => {
    // The card offers English, so a Thai phone reads English rather than whatever the
    // owner happened to list first.
    expect(negotiateLanguage('th-TH,th;q=0.9', RUSSIAN_FIRST)).toBe('en');
    expect(negotiateLanguage('th-TH', ALL)).toBe('en');
  });

  it('falls back to the card’s first language only when English is not offered', () => {
    expect(negotiateLanguage('th-TH', ['ru', 'fr'])).toBe('ru');
    expect(negotiateLanguage('de-DE', ['zh', 'fr'])).toBe('zh');
  });

  it('uses English when the browser sends no preference at all', () => {
    expect(negotiateLanguage(undefined, RUSSIAN_FIRST)).toBe('en');
    expect(negotiateLanguage('', ALL)).toBe('en');
  });

  it('treats a wildcard as "any language", so English wins when it is offered', () => {
    expect(negotiateLanguage('*', RUSSIAN_FIRST)).toBe('en');
    expect(negotiateLanguage('*', ['fr', 'zh'])).toBe('fr');
  });

  it('never returns a language the card does not offer', () => {
    for (const allowed of [ALL, RUSSIAN_FIRST, ['zh', 'fr'] as CardLanguage[]]) {
      for (const header of ['th', undefined, '*', 'en;q=0']) {
        expect(allowed).toContain(negotiateLanguage(header, allowed));
      }
    }
  });

  it('survives an empty set', () => {
    expect(negotiateLanguage('ru', [])).toBe('en');
  });
});
