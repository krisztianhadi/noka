import { describe, expect, it } from 'vitest';
import { CROCKFORD, SLUG_LENGTH, generateSlug, isSlug, normalizeSlug } from '@/lib/slug';

describe('generateSlug', () => {
  it('produces 26 Crockford characters from 16 random bytes', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(SLUG_LENGTH);
    for (const character of slug) expect(CROCKFORD).toContain(character);
  });

  it('never emits the ambiguous letters I, L, O or U', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateSlug()).not.toMatch(/[ILOU]/);
    }
  });

  it('uses every bit of the input (all-zero and all-0xff are deterministic)', () => {
    expect(generateSlug(16, () => Buffer.alloc(16, 0x00))).toBe('0'.repeat(SLUG_LENGTH));
    // 128 one-bits fill 25 groups of five, plus three trailing bits padded right.
    expect(generateSlug(16, () => Buffer.alloc(16, 0xff))).toBe(`${'Z'.repeat(25)}W`);
  });

  it('spreads across the alphabet and does not repeat', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) seen.add(generateSlug());
    expect(seen.size).toBe(500);
    const distinctCharacters = new Set([...seen].join(''));
    expect(distinctCharacters.size).toBeGreaterThan(20);
  });
});

describe('normalizeSlug', () => {
  it('folds the Crockford confusions and uppercases', () => {
    const slug = generateSlug();
    expect(normalizeSlug(slug.toLowerCase())).toBe(slug);
  });

  it('maps I and L to 1, and O to 0', () => {
    expect(normalizeSlug('IIIIIIIIIIIIIIIIIIIIIIIIII')).toBe('1'.repeat(26));
    expect(normalizeSlug('OOOOOOOOOOOOOOOOOOOOOOOOOO')).toBe('0'.repeat(26));
  });

  it('rejects the wrong length and characters outside the alphabet', () => {
    expect(normalizeSlug('ABC')).toBeNull();
    expect(normalizeSlug('!'.repeat(26))).toBeNull();
    expect(normalizeSlug('')).toBeNull();
  });

  it('recognises a generated slug', () => {
    const slug = generateSlug();
    expect(isSlug(slug)).toBe(true);
    expect(normalizeSlug(slug)).toBe(slug);
  });
});
