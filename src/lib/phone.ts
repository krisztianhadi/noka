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
import { COUNTRIES, dialFor } from '@/lib/countries';

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

  return { ok: true, e164: `+${digits}`, display: prettyPhone(`+${digits}`) };
}

/**
 * `+66812345678` -> `+66 812 345 678`, for every screen an owner reads.
 *
 * The country code comes from the same list as the picker (longest match wins, so
 * `+1` never swallows `+1…` neighbours), and the national part is grouped by
 * length. A real per-country plan needs libphonenumber; this is honest grouping
 * that never misplaces a digit or adds one.
 */
export function prettyPhone(e164: string): string {
  const digits = e164.replace(/^\+/, '');
  if (!/^\d+$/.test(digits) || digits.length < 8) return e164;

  const match = COUNTRIES.filter((country) => digits.startsWith(country.dial)).sort(
    (a, b) => b.dial.length - a.dial.length,
  )[0];
  const country = match?.dial ?? digits.slice(0, digits.length > 11 ? 3 : 2);
  const rest = digits.slice(country.length);
  if (rest.length === 0) return `+${country}`;

  const groups: Record<number, number[]> = {
    7: [3, 4],
    8: [4, 4],
    9: [3, 3, 3],
    10: [3, 3, 4],
    11: [3, 4, 4],
  };
  const plan = groups[rest.length];
  if (!plan) return `+${country} ${rest.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`;

  const parts: string[] = [];
  let cursor = 0;
  for (const size of plan) {
    parts.push(rest.slice(cursor, cursor + size));
    cursor += size;
  }
  return `+${country} ${parts.join(' ')}`;
}

/**
 * Assemble what the form sent into one number. A value that already starts with `+`
 * is taken literally — the owner typed the whole thing — otherwise the selected
 * country's dial code is prepended and the national trunk `0` (Bangkok's `08…`,
 * Budapest's `06…`) is dropped, which is the mistake people actually make.
 */
export function composePhone(countryCode: string, raw: string): string {
  const value = raw.trim();
  if (value.startsWith('+')) return normalizePhone(value).ok ? value : value;
  if (value.length === 0) return '';

  const dial = dialFor(countryCode);
  const national = value.replace(/[^\d]/g, '').replace(/^0+/, '');
  if (!dial || national.length === 0) return value;
  return `+${dial}${national}`;
}
