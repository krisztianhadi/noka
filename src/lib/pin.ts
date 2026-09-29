import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * The guest PIN (§3, D2): six digits, never stored in the clear.
 *
 * Argon2id with the OWASP-recommended parameters (19 MiB, t=2, p=1). The
 * numeric algorithm id is used because @node-rs/argon2's `Algorithm` is a
 * `declare const enum`: TypeScript inlines it, but no value exists at
 * runtime. A test asserts the produced PHC string starts with `$argon2id$`.
 */
const ARGON2ID = 2;

export const PIN_LENGTH = 6;
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function generatePin(random: (max: number) => number = (max) => randomInt(max)): string {
  const max = 10 ** PIN_LENGTH;
  return String(random(max)).padStart(PIN_LENGTH, '0');
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin, ARGON2_OPTIONS);
}

/** False on any failure — a malformed stored hash must never throw into the request. */
export async function verifyPin(storedHash: string, pin: string): Promise<boolean> {
  try {
    return await verify(storedHash, pin, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

let decoyHash: Promise<string> | undefined;

/**
 * Layer 0 (§6): burn the same argon2 work for an unknown slug as for a real
 * one, so response time is not an existence oracle.
 */
export async function decoyVerify(pin: string): Promise<void> {
  decoyHash ??= hashPin(generatePin());
  await verifyPin(await decoyHash, pin);
}

/** Groups the PIN for the printed card and the dashboard: 123456 -> "123 456". */
export function formatPin(pin: string): string {
  return pin.length === PIN_LENGTH ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}
