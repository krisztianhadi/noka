/**
 * How a contact can be reached (his list, 2026-09-29).
 *
 * One number often carries several of these, so a contact holds a *set* of
 * channels rather than one. `call` is on by default, and `sms` exists on purpose:
 * texting is what works when a responder cannot speak, cannot hear, or is in a
 * place where a call is impossible.
 *
 * Each channel is a code in the encrypted payload, never free text, so the
 * responder page can translate it and link it (D31's rule, applied here too).
 */
export const CHANNELS = ['call', 'sms', 'whatsapp', 'signal', 'telegram', 'viber'] as const;

export type Channel = (typeof CHANNELS)[number];

export const DEFAULT_CHANNELS: readonly Channel[] = ['call'];

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function sanitizeChannels(values: readonly string[]): Channel[] {
  const seen = new Set<Channel>();
  for (const value of values) {
    const code = value.trim().toLowerCase();
    if (isChannel(code)) seen.add(code);
  }
  return CHANNELS.filter((channel) => seen.has(channel));
}

export function channelMessageKey(channel: Channel): `channel.${Channel}` {
  return `channel.${channel}`;
}

/**
 * Deep links. `tel:` and `sms:` are universally supported; WhatsApp's `wa.me` is
 * the one the world recognises as a button. The other three are real documented
 * schemes but are less reliable on desktop, which is why the responder page
 * renders them as a labelled line rather than as buttons: if the link does
 * nothing, the reader still learns the number is on Signal.
 */
export function channelHref(channel: Channel, phoneE164: string): string {
  const digits = phoneE164.replace(/[^\d]/g, '');
  switch (channel) {
    case 'call':
      return `tel:${phoneE164}`;
    case 'sms':
      return `sms:${phoneE164}`;
    case 'whatsapp':
      return `https://wa.me/${digits}`;
    case 'telegram':
      return `https://t.me/+${digits}`;
    case 'signal':
      // Not encoded: Signal's own format is `#p/+<number>`, and a URI-encoded `%2B`
      // opens no chat at all (Signal-Android issue 11627). Found while auditing the
      // tests — the first version of this test asserted the encoded string, which
      // would have locked the bug in.
      return `https://signal.me/#p/${phoneE164}`;
    case 'viber':
      return `viber://chat?number=${encodeURIComponent(phoneE164)}`;
  }
}

/** The two channels that get a full-size button on the responder page. */
export const BUTTON_CHANNELS: readonly Channel[] = ['call', 'whatsapp', 'sms'];

export function isButtonChannel(channel: Channel): boolean {
  return BUTTON_CHANNELS.includes(channel);
}
