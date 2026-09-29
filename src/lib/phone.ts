/**
 * Phone numbers are stored and rendered in E.164 (§4), because that is what
 * `tel:` and `wa.me` need and what survives a hand-typed typo-free entry.
 *
 * Deliberate limitation for v1: there is no country inference. A national
 * number without a country code cannot be resolved safely, so the form asks for
 * the international form and this function says why it refused rather than
 * guessing a country. libphonenumber can replace it later without touching the
 * payload format.
 */
export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: 'empty' | 'missing-country-code' | 'too-short' | 'too-long' | 'invalid' };

const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

export function normalizePhone(input: string): PhoneResult {
  const display = input.trim();
  if (display.length === 0) return { ok: false, reason: 'empty' };

  const hasPlus = display.startsWith('+');
  const digits = display.replace(/[^\d]/g, '');

  if (!hasPlus) return { ok: false, reason: 'missing-country-code' };
  if (digits.length < MIN_DIGITS) return { ok: false, reason: 'too-short' };
  if (digits.length > MAX_DIGITS) return { ok: false, reason: 'too-long' };
  // E.164 country codes never start with 0.
  if (digits.startsWith('0')) return { ok: false, reason: 'invalid' };

  return { ok: true, e164: `+${digits}`, display };
}

/** `+66812345678` -> `+66 812 345 678`-ish, for the dashboard list. */
export function prettyPhone(e164: string): string {
  const digits = e164.replace(/^\+/, '');
  if (digits.length < 8) return e164;
  const country = digits.slice(0, digits.length > 11 ? 3 : 2);
  const rest = digits.slice(country.length);
  return `+${country} ${rest.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`;
}
