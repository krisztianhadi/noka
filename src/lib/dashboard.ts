import type { ContactError } from '@/lib/contacts';

/**
 * English copy for the owner plane. The dashboard is English-only (§13), so these
 * strings live here rather than in the responder catalogue, which must exist in
 * five languages.
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
  'not-found': 'That contact no longer exists.',
  'no-card': 'There is no card to delete.',
};

export function deleteErrorMessage(error: string): string {
  return DELETE_ERRORS[error] ?? 'Could not delete that contact.';
}

const CARD_ERRORS: Record<string, string> = {
  'no-contacts': 'Add at least one contact before making a card.',
  'no-card': 'Make a card first.',
};

export function cardErrorMessage(error: string): string {
  return CARD_ERRORS[error] ?? 'Something went wrong with the card.';
}

const SETTINGS_ERRORS: Record<string, string> = {
  'not-signed-in': 'Your session expired. Sign in again.',
  'email-invalid': 'That does not look like an email address.',
  'email-taken': 'That email is already in use, or the change was refused.',
  'password-too-short': 'The new password needs at least 10 characters.',
  'password-mismatch': 'The two new passwords do not match.',
  'password-wrong': 'The current password is not right.',
};

const NOTICES: Record<string, string> = {
  'contact-added': 'Contact added.',
  'contact-updated': 'Contact updated.',
  'contact-deleted': 'Contact deleted.',
  'contact-and-card-deleted':
    'Contact and card deleted. Add a contact and make a new card when you are ready.',
  'notes-saved': 'Notes saved.',
  'card-made': 'Card made. Print it, or copy the link and PIN.',
  'card-renewed': 'New card. The previous one stopped working immediately.',
  'card-deleted': 'Card deleted. Your contacts and notes are untouched. A new card can be made any time.',
  'email-changed': 'Email updated.',
  'email-unchanged': 'That is already your email.',
  'password-changed': 'Password updated, and every session was signed out. Sign in with the new password.',
};

export function noticeMessage(notice: string | null): string {
  return NOTICES[notice ?? ''] ?? '';
}

/** One resolver for the dashboard, whatever produced the key. */
export function errorMessage(error: string | null): string {
  if (!error) return '';
  for (const map of [CONTACT_ERRORS, DELETE_ERRORS, CARD_ERRORS, SETTINGS_ERRORS]) {
    const message = (map as Record<string, string>)[error];
    if (message) return message;
  }
  return 'Something went wrong.';
}

export function ownerRedirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });
}

/** Where the dashboard sends the owner back to, with a result to show. */
export function dashboardBack(key: 'notice' | 'error', value: string): Response {
  return ownerRedirect(`/dashboard?${key}=${encodeURIComponent(value)}`);
}

/** Settings keeps its own page: a failed password change should not lose the form. */
export function settingsBack(key: 'notice' | 'error', value: string): Response {
  return ownerRedirect(`/dashboard/settings?${key}=${encodeURIComponent(value)}`);
}
