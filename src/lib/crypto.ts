import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Contact payload encryption (D1, §4).
 *
 * AES-256-GCM, one random 96-bit IV per write, auth tag stored with the
 * ciphertext, and a 1-byte key version in front so a v2 key can be introduced
 * and rows re-encrypted in a background pass (D23).
 *
 * Wire format: [version:1][iv:12][ciphertext:n][tag:16]
 *
 * Decrypt in memory, render, discard. Never cache, never log.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_BYTES = 1;
const KEY_BYTES = 32;

export type Keyring = ReadonlyMap<number, Buffer>;

/** Build a keyring from `{ 1: base64key }`. Throws on a wrong-sized key. */
export function keyring(entries: Record<number, string>): Keyring {
  const map = new Map<number, Buffer>();
  for (const [version, secret] of Object.entries(entries)) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`Encryption key version ${version} must decode to ${KEY_BYTES} bytes`);
    }
    map.set(Number(version), key);
  }
  if (map.size === 0) throw new Error('Encryption keyring is empty');
  return map;
}

/** Highest version in the ring — the one new writes use. */
export function activeKeyVersion(ring: Keyring): number {
  return Math.max(...ring.keys());
}

export function encryptJson(
  value: unknown,
  ring: Keyring,
  keyVersion: number = activeKeyVersion(ring),
  iv: Buffer = randomBytes(IV_BYTES),
): Buffer {
  const key = ring.get(keyVersion);
  if (!key) throw new Error(`No encryption key for version ${keyVersion}`);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()]);
  return Buffer.concat([Buffer.from([keyVersion]), iv, ciphertext, cipher.getAuthTag()]);
}

export interface Decrypted<T> {
  keyVersion: number;
  value: T;
}

/** Throws on tampering, truncation or an unknown key version. */
export function decryptJson<T>(blob: Buffer, ring: Keyring): Decrypted<T> {
  if (blob.length < VERSION_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext is truncated');
  }
  const keyVersion = blob[0] as number;
  const key = ring.get(keyVersion);
  if (!key) throw new Error(`No encryption key for version ${keyVersion}`);

  const iv = blob.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(VERSION_BYTES + IV_BYTES, blob.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return { keyVersion, value: JSON.parse(plaintext.toString('utf8')) as T };
}


/** Constant-time comparison for two hex/base64 digests of equal length. */

/**
 * Signed-value helpers, shared by everything that signs something.
 *
 * These live here rather than in each caller because the alternative is what the
 * codebase actually had: two HMAC implementations, where the tested one was unused
 * and the live one was a private copy. One implementation, exercised through the
 * cookie round-trip in `view-cookie.test.ts` and directly here.
 */
export function hmacBase64Url(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
