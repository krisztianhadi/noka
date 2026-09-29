import { randomInt } from 'node:crypto';
import { ARGON2_OPTIONS, argon2Hash, argon2Verify } from './argon2';

/**
 * The guest PIN (§3, D2): six digits, never stored in the clear, hashed with
 * the same Argon2id parameters as owner passwords (src/lib/argon2.ts).
 */
export const PIN_LENGTH = 6;

export { ARGON2_OPTIONS };

export function generatePin(random: (max: number) => number = (max) => randomInt(max)): string {
  const max = 10 ** PIN_LENGTH;
  return String(random(max)).padStart(PIN_LENGTH, '0');
}

export function hashPin(pin: string): Promise<string> {
  return argon2Hash(pin);
}

export function verifyPin(storedHash: string, pin: string): Promise<boolean> {
  return argon2Verify(storedHash, pin);
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
