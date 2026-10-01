import { describe, expect, it } from 'vitest';
import { plural } from '@/lib/plural';

/**
 * Counted text in five languages.
 *
 * The expectations are linguistic facts about the languages, not values read back out of our own
 * catalogue: Russian really does have three forms for this phrase, and picking the wrong one is
 * visible to any Russian speaker. English and Chinese have one form plus "other", which is the
 * case the old hand-picked one/many pair happened to get right.
 */
const count = (locale: Parameters<typeof plural>[0], value: number) =>
  plural(locale, 'owner.contacts.count', value).replace(/\s+/g, ' ');

describe('plural', () => {
  it('picks the Russian form that matches the number', () => {
    expect(count('ru', 1)).toBe('1 контакт');
    expect(count('ru', 3)).toBe('3 контакта');
    expect(count('ru', 5)).toBe('5 контактов');
    expect(count('ru', 11)).toBe('11 контактов');
    // 21 counts as "one" again — the rule the old one/many pair could not express.
    expect(count('ru', 21)).toBe('21 контакт');
    expect(count('ru', 22)).toBe('22 контакта');
  });

  it('uses singular for one and plural otherwise in English, Spanish and French', () => {
    expect(count('en', 1)).toBe('1 person');
    expect(count('en', 2)).toBe('2 people');
    expect(count('es', 1)).toBe('1 persona');
    expect(count('es', 3)).toBe('3 personas');
    expect(count('fr', 1)).toBe('1 personne');
    // French counts zero as singular, which Intl knows and a hand-written rule would not.
    expect(count('fr', 0)).toBe('0 personne');
    expect(count('fr', 2)).toBe('2 personnes');
  });

  it('has one form in Chinese', () => {
    expect(count('zh', 1)).toBe('1 位联系人');
    expect(count('zh', 7)).toBe('7 位联系人');
  });
});
