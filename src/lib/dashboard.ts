import type { ContactError } from '@/lib/contacts';

/**
 * English copy for the owner plane. The dashboard is English-only (§13), so
 * these strings live here rather than in the responder catalogue, which must
 * exist in five languages.
 */
const CONTACT_ERRORS: Record<ContactError, string> = {
  'name-required': 'Give the contact a name.',
  'relation-invalid': 'Pick a relation from the list.',
  empty: 'Enter a phone number.',
  'missing-country-code': 'Start with a country code, e.g. +66 for Thailand.',
  'too-short': 'That number is too short.',
  'too-long': 'That number is too long.',
  invalid: 'That number does not look right.',
  'not-found': 'That contact no longer exists.',
};

export function contactErrorMessage(error: string): string {
  return CONTACT_ERRORS[error as ContactError] ?? 'Something went wrong with that contact.';
}

const DELETE_ERRORS: Record<string, string> = {
  'last-contact-while-active': 'Switch the card off before deleting the last contact.',
  'not-found': 'That contact no longer exists.',
};

export function deleteErrorMessage(error: string): string {
  return DELETE_ERRORS[error] ?? 'Could not delete that contact.';
}

export function ownerRedirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });
}
