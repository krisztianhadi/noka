import { describe, expect, it } from 'vitest';
import { channelHref, sanitizeChannels } from '@/lib/channels';

const PHONE = '+66812345678';

/**
 * The deep links the responder page renders as buttons. A wrong scheme or a stray
 * `+` is a button that does nothing for the person holding the card, which is the
 * one failure this page cannot afford — so every channel is asserted, not just the
 * two that happen to be common.
 */
describe('channel links', () => {
  it('builds the right link for every channel', () => {
    expect(channelHref('call', PHONE)).toBe('tel:+66812345678');
    expect(channelHref('sms', PHONE)).toBe('sms:+66812345678');
    // WhatsApp wants the number without the plus; the others want it encoded or bare.
    expect(channelHref('whatsapp', PHONE)).toBe('https://wa.me/66812345678');
    expect(channelHref('telegram', PHONE)).toBe('https://t.me/+66812345678');
    // Signal wants the literal plus: `%2B` opens no chat (Signal-Android #11627).
    expect(channelHref('signal', PHONE)).toBe('https://signal.me/#p/+66812345678');
    expect(channelHref('viber', PHONE)).toBe('viber://chat?number=%2B66812345678');
  });

  it('keeps only the channels it knows, in the vocabulary order, defaulting to a call', () => {
    expect(sanitizeChannels(['signal', 'whatsapp', 'nonsense'])).toEqual(['whatsapp', 'signal']);
    expect(sanitizeChannels([])).toEqual([]);
  });
});
