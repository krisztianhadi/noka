import { randomBytes } from 'node:crypto';

/**
 * Card slugs (D13): 16 random bytes rendered as uppercase Crockford base32.
 *
 * Crockford drops I, L, O and U, so a misread character can never be
 * ambiguous, and the alphabet keeps the QR in alphanumeric mode — 26
 * characters plus the origin stays at QR version 3.
 */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SLUG_BYTES = 16;
export const SLUG_LENGTH = 26; // ceil(128 / 5)

export function generateSlug(bytes: number = SLUG_BYTES, random: (n: number) => Buffer = randomBytes): string {
  const buffer = random(bytes);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xfffff; // keep only the pending bits
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Normalise a slug typed or read from a URL: uppercase, and the Crockford
 * confusions folded (I/L -> 1, O -> 0). Returns null when the result cannot
 * be a slug, so the caller can render the identical generic PIN form.
 */
export function normalizeSlug(input: string): string | null {
  const folded = input
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/-/g, '');
  if (folded.length !== SLUG_LENGTH) return null;
  for (const character of folded) {
    if (!CROCKFORD.includes(character)) return null;
  }
  return folded;
}

