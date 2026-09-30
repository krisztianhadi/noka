import type { Channel } from '@/lib/channels';

/**
 * The fictional card behind `/demo`.
 *
 * The landing page shows a card with a QR code, and someone will scan it. A code that leads to
 * a static picture of a contact list answers the wrong question — the question is "what happens
 * when I scan it", and the answer is a PIN, then contacts, then a way out. So the demo runs the
 * same three steps against this data instead of describing them.
 *
 * Reserved-for-fiction numbers only (555 in North America, and here a repeated 555 block
 * elsewhere), invented people, and a PIN that is printed on the sample card so a visitor can
 * actually type it.
 */
export const DEMO_PIN = '123456';
export const DEMO_PIN_DISPLAY = '123 456';
export const DEMO_OWNER = 'Sample Card';

export interface DemoContact {
  name: string;
  relation: string;
  phoneDisplay: string;
  phoneE164: string;
  channels: Channel[];
  /** Language codes, plus the name to show for them. */
  spoken: Array<{ code: string; label: string }>;
  /** Cannot speak or hear: no call button, text offered first. */
  textOnly?: boolean;
}

export const DEMO_CONTACTS: DemoContact[] = [
  {
    name: 'Maria Silva',
    relation: 'Partner',
    phoneDisplay: '+66 555 123 456',
    phoneE164: '+66555123456',
    channels: ['call', 'whatsapp', 'signal'],
    spoken: [
      { code: 'th', label: 'Thai' },
      { code: 'en', label: 'English' },
    ],
  },
  {
    name: 'János Kovács',
    relation: 'Brother',
    phoneDisplay: '+36 555 987 654',
    phoneE164: '+36555987654',
    channels: ['telegram', 'viber'],
    spoken: [
      { code: 'hu', label: 'Hungarian' },
      { code: 'en', label: 'English' },
    ],
    textOnly: true,
  },
];

export const DEMO_NOTES = 'No allergies. Blood type O+.';

/** Same rule as the real page: someone who cannot hear is not offered a call. */
export function demoChannels(contact: DemoContact): Channel[] {
  if (!contact.textOnly) return contact.channels;
  return ['sms', ...contact.channels.filter((channel) => channel !== 'call')];
}

/** The banner every demo state carries, so nobody mistakes it for a real card. */
export const DEMO_BANNER_ON_PIN =
  'Example card. A real card prints its PIN on the card itself, and nobody else knows it.';
export const DEMO_BANNER_ON_VIEW =
  'Example card. Nobody real is listed here and the numbers are fictional. A real card opens behind its own PIN.';
