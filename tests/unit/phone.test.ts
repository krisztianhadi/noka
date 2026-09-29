import { describe, expect, it } from 'vitest';
import { normalizePhone, prettyPhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it('accepts an international number and groups the digits for display', () => {
    const result = normalizePhone('+66 812 345 678');
    expect(result).toEqual({ ok: true, e164: '+66812345678', display: '+66 812 345 678' });
  });

  it('strips separators of every kind', () => {
    for (const input of ['+66-812-345-678', '+66 (812) 345 678', '+66.812.345.678']) {
      const result = normalizePhone(input);
      expect(result.ok && result.e164).toBe('+66812345678');
    }
  });

  it('refuses a national number rather than guessing a country', () => {
    expect(normalizePhone('0812345678')).toEqual({ ok: false, reason: 'missing-country-code' });
  });

  it('refuses an empty value, a too-short one and a too-long one', () => {
    expect(normalizePhone('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizePhone('+12345')).toEqual({ ok: false, reason: 'too-short' });
    expect(normalizePhone('+1234567890123456')).toEqual({ ok: false, reason: 'too-long' });
  });

  it('refuses a country code starting with zero', () => {
    expect(normalizePhone('+0123456789')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts the shortest and longest legal lengths', () => {
    expect(normalizePhone('+1234567').ok).toBe(true);
    expect(normalizePhone('+123456789012345').ok).toBe(true);
  });
});

describe('prettyPhone', () => {
  it('groups long numbers for reading', () => {
    expect(prettyPhone('+66812345678')).toBe('+66 812 345 678');
  });

  it('leaves short values alone', () => {
    expect(prettyPhone('+123456')).toBe('+123456');
  });
});
