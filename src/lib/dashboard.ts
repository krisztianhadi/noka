import type { MessageKey } from '@/i18n/catalogue';
import type { ContactError } from '@/lib/contacts';

/**
 * Result and error **keys** for the owner plane (ADR-032).
 *
 * These used to be English sentences, which was fine while the dashboard was English-only
 * (§13, now superseded). Returning keys keeps one rule: no user-facing English outside
 * `src/i18n/locales/`, so a page cannot accidentally ship an untranslated sentence.
 */
const CONTACT_ERRORS: Record<ContactError, MessageKey> = {
  'name-required': 'error.name-required',
  'name-too-long': 'error.name-too-long',
  'too-many-contacts': 'error.too-many-contacts',
  'relation-invalid': 'error.relation-invalid',
  empty: 'error.phone-empty',
  'missing-country-code': 'error.missing-country-code',
  'too-short': 'error.too-short',
  'too-long': 'error.too-long',
  invalid: 'error.invalid-number',
  'not-found': 'error.contact-not-found',
};

const DELETE_ERRORS: Record<string, MessageKey> = {
  'not-found': 'error.contact-not-found',
  'no-card': 'error.no-card',
};

const CARD_ERRORS: Record<string, MessageKey> = {
  'no-contacts': 'error.card-no-contacts',
  'no-card': 'error.card-none',
};

const SETTINGS_ERRORS: Record<string, MessageKey> = {
  'not-signed-in': 'error.session-expired',
  'email-invalid': 'error.email-invalid',
  'email-taken': 'error.email-taken',
  'password-too-short': 'error.password-too-short',
  'password-mismatch': 'error.password-mismatch',
  'password-wrong': 'error.password-wrong',
};

const NOTICES: Record<string, MessageKey> = {
  'contact-added': 'notice.contact-added',
  'contact-updated': 'notice.contact-updated',
  'contact-deleted': 'notice.contact-deleted',
  'contact-and-card-deleted': 'notice.contact-and-card-deleted',
  'notes-saved': 'notice.notes-saved',
  'card-made': 'notice.card-made',
  'card-renewed': 'notice.card-renewed',
  'card-deleted': 'notice.card-deleted',
  'email-changed': 'notice.email-changed',
  'name-changed': 'notice.name-changed',
  'email-unchanged': 'notice.email-unchanged',
  'password-changed': 'notice.password-changed',
};

/** The key for a notice the dashboard sent back, or null when there is none. */
export function noticeKey(notice: string | null): MessageKey | null {
  if (!notice) return null;
  return NOTICES[notice] ?? null;
}

/** One resolver for the dashboard, whatever produced the key. */
export function errorKey(error: string | null): MessageKey | null {
  if (!error) return null;
  const maps: Array<Record<string, MessageKey>> = [
    CONTACT_ERRORS,
    DELETE_ERRORS,
    CARD_ERRORS,
    SETTINGS_ERRORS,
  ];
  for (const map of maps) {
    const key = map[error];
    if (key) return key;
  }
  return 'error.generic';
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
