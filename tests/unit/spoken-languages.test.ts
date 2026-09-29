import { describe, expect, it } from 'vitest';
import { MESSAGES, messageKeys } from '@/i18n/catalogue';
import { CARD_LANGUAGES } from '@/i18n/languages';
import { SPOKEN_LANGUAGES, isSpokenLanguage, sanitizeSpokenLanguages, spokenLanguageMessageKey } from '@/lib/spoken-languages';

describe('spoken-language vocabulary', () => {
  it('labels every code in every UI language', () => {
    for (const code of SPOKEN_LANGUAGES) {
      const key = spokenLanguageMessageKey(code);
      for (const language of CARD_LANGUAGES) {
        expect(MESSAGES[language][key], `${language} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('has no dead spoken.* key that the vocabulary does not declare', () => {
    const declared = new Set(SPOKEN_LANGUAGES.map((code) => spokenLanguageMessageKey(code)));
    const present = messageKeys().filter((key) => key.startsWith('spoken.'));
    expect(present.sort()).toEqual([...declared].sort());
  });

  it('is wider than the card’s own print languages, on purpose', () => {
    // A contact may speak Thai even though the card is not printed in Thai.
    expect(isSpokenLanguage('th')).toBe(true);
    expect(isSpokenLanguage('hu')).toBe(true);
    expect(CARD_LANGUAGES).not.toContain('th');
  });

  it('keeps order, drops duplicates and rejects anything unknown', () => {
    expect(sanitizeSpokenLanguages(['th', 'en', 'th', 'xx', ''])).toEqual(['th', 'en']);
    expect(sanitizeSpokenLanguages(['XX'])).toEqual([]);
  });

  it('normalises case and whitespace', () => {
    expect(sanitizeSpokenLanguages([' EN ', 'Th'])).toEqual(['en', 'th']);
  });
});
