import { hash, verify } from '@node-rs/argon2';

/**
 * One KDF for the whole app (§3): Argon2id with the OWASP-recommended
 * parameters (19 MiB, t=2, p=1). Used for owner passwords and for the card
 * PINs alike.
 *
 * The numeric algorithm id is used because @node-rs/argon2's `Algorithm` is a
 * `declare const enum`: TypeScript inlines it, but no value exists at runtime.
 * A test asserts the produced PHC string starts with `$argon2id$`.
 */
const ARGON2ID = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function argon2Hash(secret: string): Promise<string> {
  return hash(secret, ARGON2_OPTIONS);
}

/** False on any failure — a malformed stored hash must never throw into a request. */
export async function argon2Verify(storedHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(storedHash, secret, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
