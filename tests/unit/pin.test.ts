import { describe, expect, it } from 'vitest';
import { ARGON2_OPTIONS, PIN_LENGTH, decoyVerify, formatPin, generatePin, hashPin, verifyPin } from '@/lib/pin';

describe('generatePin', () => {
  it('is exactly six digits', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generatePin()).toMatch(/^\d{6}$/);
    }
  });

  it('pads low values instead of shortening them', () => {
    expect(generatePin(() => 7)).toBe('000007');
    expect(generatePin(() => 0)).toBe('000000');
  });

  it('spreads across the space', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 300; index += 1) seen.add(generatePin());
    expect(seen.size).toBeGreaterThan(250);
  });

  it('asks the source for the full range', () => {
    let asked = 0;
    generatePin((max) => {
      asked = max;
      return 1;
    });
    expect(asked).toBe(10 ** PIN_LENGTH);
  });
});

describe('argon2id hashing', () => {
  it('produces an argon2id PHC string with the OWASP parameters', async () => {
    const stored = await hashPin('123456');
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).toContain(`m=${ARGON2_OPTIONS.memoryCost}`);
    expect(stored).toContain(`t=${ARGON2_OPTIONS.timeCost}`);
    expect(stored).not.toContain('123456');
  });

  it('verifies the right PIN and rejects a wrong one', async () => {
    const stored = await hashPin('123456');
    await expect(verifyPin(stored, '123456')).resolves.toBe(true);
    await expect(verifyPin(stored, '123457')).resolves.toBe(false);
  });

  it('salts each hash, so the same PIN never stores the same string', async () => {
    const first = await hashPin('123456');
    const second = await hashPin('123456');
    expect(first).not.toBe(second);
    await expect(verifyPin(first, '123456')).resolves.toBe(true);
    await expect(verifyPin(second, '123456')).resolves.toBe(true);
  });

  it('returns false for a malformed stored hash instead of throwing into the request', async () => {
    await expect(verifyPin('not-a-hash', '123456')).resolves.toBe(false);
    await expect(verifyPin('', '123456')).resolves.toBe(false);
  });

  it('burns comparable work for an unknown slug (layer 0)', async () => {
    await expect(decoyVerify('123456')).resolves.toBeUndefined();
  });
});

describe('formatPin', () => {
  it('groups the digits for reading aloud and printing', () => {
    expect(formatPin('123456')).toBe('123 456');
  });

  it('leaves anything unexpected alone', () => {
    expect(formatPin('1234')).toBe('1234');
  });
});
