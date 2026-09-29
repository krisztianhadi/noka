import { describe, expect, it } from 'vitest';
import { MESSAGES, t, type MessageKey } from '@/i18n/catalogue';
import { CARD_PHRASES, CARD_PHRASE_ORDER, cardPhrasesFor } from '@/i18n/card-copy';
import { CARD_LANGUAGES, LANGUAGE_INFO, primarySubtag, sanitizeLanguageSet } from '@/i18n/languages';
import { RELATIONS, isRelation } from '@/lib/relations';

describe('message catalogue', () => {
  it('has every key in every card language (the build-failing rule of D20)', () => {
    const keys = Object.keys(MESSAGES.en) as MessageKey[];
    expect(keys.length).toBeGreaterThan(10);
    for (const language of CARD_LANGUAGES) {
      for (const key of keys) {
        expect(MESSAGES[language][key], `${language} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('has no extra keys in a language that English does not define', () => {
    const canonical = new Set(Object.keys(MESSAGES.en) as MessageKey[]);
    for (const language of CARD_LANGUAGES) {
      for (const key of Object.keys(MESSAGES[language])) expect(canonical.has(key as never)).toBe(true);
    }
  });

  it('never leaves a string empty or untranslated-looking', () => {
    for (const language of CARD_LANGUAGES) {
      for (const key of Object.keys(MESSAGES.en) as MessageKey[]) {
        const value = MESSAGES[language][key];
        expect(value.trim().length).toBeGreaterThan(0);
        // A marker token, not a word that merely starts with those letters: Spanish
        // "Todo listo" is finished copy, not a TODO. Markers are uppercase and stand alone.
        expect(value).not.toMatch(/^(TODO|FIXME|XXX|\?\?\?)(?![\p{Ll}])/u);
      }
    }
  });

  it('keeps placeholder tokens identical across languages', () => {
    const placeholders = (value: string) => (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(MESSAGES.en) as MessageKey[]) {
      const expected = placeholders(MESSAGES.en[key]);
      for (const language of CARD_LANGUAGES) {
        expect(placeholders(MESSAGES[language][key]), `${language}.${key}`).toBe(expected);
      }
    }
  });

  it('labels every relation in every language, and only the known relations', () => {
    for (const relation of RELATIONS) {
      // The key the pages actually build (`relation.${…}` in the responder view).
      const key = `relation.${relation}` as MessageKey;
      for (const language of CARD_LANGUAGES) {
        expect(MESSAGES[language][key]).toBeTruthy();
      }
    }
    // A key for a relation that no longer exists would be dead copy.
    const relationKeys = (Object.keys(MESSAGES.en) as MessageKey[]).filter((key) => key.startsWith('relation.'));
    expect(relationKeys).toHaveLength(RELATIONS.length);
  });

  it('returns the requested language', () => {
    expect(t('ru', 'view.call')).toBe('Позвонить');
    expect(t('en', 'view.call')).toBe('Call');
  });
});

describe("the printed card's copy", () => {
  it('exists for every language the card can carry', () => {
    // The artwork is the one artefact nobody can fix after the fact: a missing language here
    // used to compile and print a card with a language silently absent.
    for (const language of CARD_LANGUAGES) {
      expect(CARD_PHRASES[language]?.title, language).toBeTruthy();
      expect(CARD_PHRASES[language]?.scan, language).toBeTruthy();
    }
    expect(CARD_PHRASE_ORDER.slice().sort()).toEqual([...CARD_LANGUAGES].sort());
  });

  it("prints the requested languages in the mockup's order, never an empty card", () => {
    expect(cardPhrasesFor(['zh', 'en']).map((phrase) => phrase.scan)).toEqual(['SCAN', '扫描']);
    // A card whose language set somehow matches nothing still prints something readable.
    expect(cardPhrasesFor(['xx']).length).toBeGreaterThan(0);
  });
});

describe('language set', () => {
  it('exposes the five shipped languages with an endonym and an html tag', () => {
    expect(CARD_LANGUAGES).toEqual(['en', 'es', 'fr', 'zh', 'ru']);
    for (const language of CARD_LANGUAGES) {
      expect(LANGUAGE_INFO[language].endonym.length).toBeGreaterThan(0);
      expect(LANGUAGE_INFO[language].htmlLang.length).toBeGreaterThan(0);
    }
    expect(LANGUAGE_INFO.zh.htmlLang).toBe('zh-Hans');
  });

  it('reduces a full tag to its primary subtag', () => {
    expect(primarySubtag('en-GB')).toBe('en');
    expect(primarySubtag('zh-Hans-CN')).toBe('zh');
    expect(primarySubtag(' RU ')).toBe('ru');
  });

  it('sanitises an owner-supplied set, keeping order and dropping duplicates', () => {
    expect(sanitizeLanguageSet(['ru', 'en', 'en'])).toEqual(['ru', 'en']);
    expect(sanitizeLanguageSet(['zh-Hans', 'es'])).toEqual(['zh', 'es']);
  });

  it('falls back to the full default set when nothing is recognised', () => {
    expect(sanitizeLanguageSet(['xx', ''])).toEqual([...CARD_LANGUAGES]);
  });
});

describe('relations', () => {
  it('is a closed vocabulary', () => {
    expect(RELATIONS).toContain('spouse');
    expect(RELATIONS).toContain('other');
    expect(isRelation('spouse')).toBe(true);
    expect(isRelation('uncle')).toBe(false);
  });
});
