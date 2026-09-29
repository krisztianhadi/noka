import { describe, expect, it } from 'vitest';
import { CONTACT_PAYLOAD_SCHEMA, parseContactPayload, readContactPayload } from '@/lib/contact-payload';
import { channelHref } from '@/lib/channels';

const valid = {
  schema: CONTACT_PAYLOAD_SCHEMA,
  name: 'Maria Silva',
  relation: 'spouse',
  phone_e164: '+66812345678',
  phone_display: '+66 81 234 5678',
  spoken_languages: ['en', 'th'],
  channels: ['call', 'whatsapp'],
};

describe('contact payload (schema 2)', () => {
  it('accepts a well-formed payload', () => {
    expect(parseContactPayload(valid)).toEqual(valid);
  });

  it('defaults the spoken languages to an empty list', () => {
    const { spoken_languages: _ignored, ...withoutLanguages } = valid;
    expect(parseContactPayload(withoutLanguages).spoken_languages).toEqual([]);
  });

  it('rejects a relation that is not in the fixed vocabulary (D31)', () => {
    expect(() => parseContactPayload({ ...valid, relation: 'uncle' })).toThrow();
    expect(() => parseContactPayload({ ...valid, relation: 'Wife' })).toThrow();
  });

  it('requires an E.164 number', () => {
    expect(() => parseContactPayload({ ...valid, phone_e164: '081 234 5678' })).toThrow();
    expect(() => parseContactPayload({ ...valid, phone_e164: '+0123456789' })).toThrow();
    expect(parseContactPayload({ ...valid, phone_e164: '+14155552671' }).phone_e164).toBe('+14155552671');
  });

  it('requires a name', () => {
    expect(() => parseContactPayload({ ...valid, name: '' })).toThrow();
  });

  it('hard-fails on an unknown schema version rather than rendering half a contact', () => {
    expect(() => readContactPayload({ ...valid, schema: 1 })).toThrow(/Unsupported contact payload schema: 1/);
    expect(() => readContactPayload({ ...valid, schema: 4 })).toThrow(/schema: 4/);
    expect(() => readContactPayload(null)).toThrow(/Unsupported/);
    expect(readContactPayload(valid).name).toBe('Maria Silva');
  });

  it('still reads a schema-2 payload, defaulting the channels to a phone call', () => {
    const { channels: _dropped, ...v2 } = valid;
    const upgraded = readContactPayload({ ...v2, schema: 2 });
    expect(upgraded.schema).toBe(CONTACT_PAYLOAD_SCHEMA);
    expect(upgraded.channels).toEqual(['call']);
  });

  it('validates the channels against the vocabulary', () => {
    // This layer validates and preserves the owner's order; the ordering into the
    // vocabulary's canonical sequence happens in the contacts service, which is
    // where a view is built (see the integration suite).
    expect(parseContactPayload({ ...valid, channels: ['signal', 'whatsapp'] }).channels).toEqual([
      'signal',
      'whatsapp',
    ]);
    expect(() => parseContactPayload({ ...valid, channels: ['carrier-pigeon'] })).toThrow();
  });
});

describe('link builders', () => {
  it('builds a tel: link from E.164', () => {
    expect(channelHref('call', valid.phone_e164)).toBe('tel:+66812345678');
  });

  it('builds a wa.me link without the plus, as WhatsApp requires', () => {
    expect(channelHref('whatsapp', valid.phone_e164)).toBe('https://wa.me/66812345678');
  });
});
