/**
 * Country dial codes for the phone field, with emoji flags derived from the ISO
 * code (regional indicator symbols) — so there is no flag sprite, no image request
 * and nothing to keep in sync with a third party.
 *
 * A curated list, not the full E.164 set: every entry here is a country he or a
 * plausible owner would call, and the input still accepts a full `+…` number typed
 * by hand, so the list is a convenience rather than a gate.
 */
export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Dial code without the plus. */
  dial: string;
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'AU', dial: '61', name: 'Australia' },
  { code: 'AT', dial: '43', name: 'Austria' },
  { code: 'BE', dial: '32', name: 'Belgium' },
  { code: 'BR', dial: '55', name: 'Brazil' },
  { code: 'BG', dial: '359', name: 'Bulgaria' },
  { code: 'CA', dial: '1', name: 'Canada' },
  { code: 'CN', dial: '86', name: 'China' },
  { code: 'HR', dial: '385', name: 'Croatia' },
  { code: 'CY', dial: '357', name: 'Cyprus' },
  { code: 'CZ', dial: '420', name: 'Czechia' },
  { code: 'DK', dial: '45', name: 'Denmark' },
  { code: 'EE', dial: '372', name: 'Estonia' },
  { code: 'FI', dial: '358', name: 'Finland' },
  { code: 'FR', dial: '33', name: 'France' },
  { code: 'DE', dial: '49', name: 'Germany' },
  { code: 'GR', dial: '30', name: 'Greece' },
  { code: 'HK', dial: '852', name: 'Hong Kong' },
  { code: 'HU', dial: '36', name: 'Hungary' },
  { code: 'IN', dial: '91', name: 'India' },
  { code: 'ID', dial: '62', name: 'Indonesia' },
  { code: 'IE', dial: '353', name: 'Ireland' },
  { code: 'IL', dial: '972', name: 'Israel' },
  { code: 'IT', dial: '39', name: 'Italy' },
  { code: 'JP', dial: '81', name: 'Japan' },
  { code: 'KH', dial: '855', name: 'Cambodia' },
  { code: 'KR', dial: '82', name: 'Korea, South' },
  { code: 'LA', dial: '856', name: 'Laos' },
  { code: 'LV', dial: '371', name: 'Latvia' },
  { code: 'LT', dial: '370', name: 'Lithuania' },
  { code: 'LU', dial: '352', name: 'Luxembourg' },
  { code: 'MY', dial: '60', name: 'Malaysia' },
  { code: 'MT', dial: '356', name: 'Malta' },
  { code: 'MX', dial: '52', name: 'Mexico' },
  { code: 'MM', dial: '95', name: 'Myanmar' },
  { code: 'NL', dial: '31', name: 'Netherlands' },
  { code: 'NZ', dial: '64', name: 'New Zealand' },
  { code: 'NO', dial: '47', name: 'Norway' },
  { code: 'PH', dial: '63', name: 'Philippines' },
  { code: 'PL', dial: '48', name: 'Poland' },
  { code: 'PT', dial: '351', name: 'Portugal' },
  { code: 'RO', dial: '40', name: 'Romania' },
  { code: 'RU', dial: '7', name: 'Russia' },
  { code: 'SA', dial: '966', name: 'Saudi Arabia' },
  { code: 'RS', dial: '381', name: 'Serbia' },
  { code: 'SG', dial: '65', name: 'Singapore' },
  { code: 'SK', dial: '421', name: 'Slovakia' },
  { code: 'SI', dial: '386', name: 'Slovenia' },
  { code: 'ZA', dial: '27', name: 'South Africa' },
  { code: 'ES', dial: '34', name: 'Spain' },
  { code: 'LK', dial: '94', name: 'Sri Lanka' },
  { code: 'SE', dial: '46', name: 'Sweden' },
  { code: 'CH', dial: '41', name: 'Switzerland' },
  { code: 'TW', dial: '886', name: 'Taiwan' },
  { code: 'TH', dial: '66', name: 'Thailand' },
  { code: 'TR', dial: '90', name: 'Türkiye' },
  { code: 'UA', dial: '380', name: 'Ukraine' },
  { code: 'AE', dial: '971', name: 'United Arab Emirates' },
  { code: 'GB', dial: '44', name: 'United Kingdom' },
  { code: 'US', dial: '1', name: 'United States' },
  { code: 'VN', dial: '84', name: 'Vietnam' },
];

/** 🇹🇭 from TH, without shipping a single image. */
export function flagFor(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🏳️';
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function findByDialAndCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code);
}

export function dialFor(code: string): string {
  return findByDialAndCode(code)?.dial ?? '';
}

/** The default selection: the owner's own region where that is known. */
export const DEFAULT_COUNTRY = 'TH';
