import { describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '@/i18n/catalogue';
import { SPOKEN_LANGUAGES, sanitizeSpokenLanguages } from '@/lib/spoken-languages';

/** The key the pages build (`spoken.${code}` in the responder view and the dashboard). */
const key = (code: string) => `spoken.${code}` as MessageKey;

describe('spoken-language vocabulary', () => {
  it('has a key in the catalogue for every spoken language it declares', () => {
    // Exact set equality both ways: a declared language with no copy, or copy for a
    // language the vocabulary dropped, is a defect. The catalogue's own completeness
    // test covers the rest of the message set.
    const declared = SPOKEN_LANGUAGES.map(key).sort();
    const present = (Object.keys(MESSAGES.en) as MessageKey[]).filter((k) => k.startsWith('spoken.')).sort();
    expect(present).toEqual(declared);
  });

  it('keeps order, drops duplicates, rejects anything unknown and normalises case', () => {
    expect(sanitizeSpokenLanguages(['th', 'en', 'th', 'xx', ''])).toEqual(['th', 'en']);
    expect(sanitizeSpokenLanguages([' EN ', 'Th'])).toEqual(['en', 'th']);
    expect(sanitizeSpokenLanguages(['XX'])).toEqual([]);
  });
});
