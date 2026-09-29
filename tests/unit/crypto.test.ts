import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { activeKeyVersion, constantTimeEqual, decryptJson, encryptJson, hmacBase64Url, keyring } from '@/lib/crypto';

const key1 = randomBytes(32).toString('base64');
const key2 = randomBytes(32).toString('base64');
const ring = keyring({ 1: key1 });

const contact = {
  schema: 2,
  name: 'Maria Silva',
  relation: 'spouse',
  phone_e164: '+66812345678',
  phone_display: '+66 81 234 5678',
  spoken_languages: ['en', 'th'],
};

describe('keyring', () => {
  it('rejects a key that is not 32 bytes', () => {
    expect(() => keyring({ 1: Buffer.from('short').toString('base64') })).toThrow(/32 bytes/);
  });

  it('rejects an empty keyring', () => {
    expect(() => keyring({})).toThrow(/empty/);
  });

  it('reports the highest version as active', () => {
    expect(activeKeyVersion(keyring({ 1: key1, 2: key2 }))).toBe(2);
  });
});

describe('encryptJson / decryptJson', () => {
  it('round-trips a payload', () => {
    const blob = encryptJson(contact, ring);
    const result = decryptJson<typeof contact>(blob, ring);
    expect(result.value).toEqual(contact);
    expect(result.keyVersion).toBe(1);
  });

  it('never repeats a ciphertext for the same plaintext', () => {
    const first = encryptJson(contact, ring);
    const second = encryptJson(contact, ring);
    expect(first.equals(second)).toBe(false);
  });

  it('does not contain the plaintext', () => {
    const blob = encryptJson(contact, ring);
    expect(blob.toString('utf8')).not.toContain('Maria');
    expect(blob.toString('hex')).not.toContain(Buffer.from('Maria').toString('hex'));
  });

  it('stamps the key version in the first byte', () => {
    const blob = encryptJson(contact, keyring({ 1: key1, 2: key2 }), 2);
    expect(blob[0]).toBe(2);
    expect(decryptJson(blob, keyring({ 1: key1, 2: key2 })).value).toEqual(contact);
  });

  it('refuses to write with a version that is not in the ring', () => {
    expect(() => encryptJson(contact, ring, 9)).toThrow(/No encryption key/);
  });

  it('fails on a tampered ciphertext instead of returning garbage', () => {
    const blob = encryptJson(contact, ring);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 20] ^= 0xff;
    expect(() => decryptJson(tampered, ring)).toThrow();
  });

  it('fails on a truncated blob', () => {
    expect(() => decryptJson(Buffer.alloc(4), ring)).toThrow(/truncated/);
  });

  it('fails with the wrong key rather than leaking a partial value', () => {
    const blob = encryptJson(contact, keyring({ 1: key1 }));
    expect(() => decryptJson(blob, keyring({ 1: key2 }))).toThrow();
  });

  it('fails when the key version is missing from the ring', () => {
    const blob = encryptJson(contact, keyring({ 1: key1, 2: key2 }), 2);
    expect(() => decryptJson(blob, keyring({ 1: key1 }))).toThrow(/No encryption key for version 2/);
  });
});

describe('signed-value helpers', () => {
  it('keys the digest, and is not a bare hash of the body', () => {
    const body = 'card.claims.payload';
    const first = hmacBase64Url(body, 'secret-one');
    expect(first).not.toBe(hmacBase64Url(body, 'secret-two'));
    expect(first).not.toContain(body);
    expect(hmacBase64Url(body, 'secret-one')).toBe(first);
  });

  it('compares equal values and rejects different ones, including different lengths', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
