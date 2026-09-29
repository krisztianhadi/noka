import { describe, expect, it } from 'vitest';
import { CONTACT_PAYLOAD_SCHEMA, parseContactPayload, readContactPayload, telHref, whatsappHref } from '@/lib/contact-payload';

const valid = {
  schema: CONTACT_PAYLOAD_SCHEMA,
  name: 'Maria Silva',
  relation: 'spouse',
  phone_e164: '+66812345678',
  phone_display: '+66 81 234 5678',
  spoken_languages: ['en', 'th'],
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
    expect(() => readContactPayload({ ...valid, schema: 3 })).toThrow(/schema: 3/);
    expect(() => readContactPayload(null)).toThrow(/Unsupported/);
    expect(readContactPayload(valid).name).toBe('Maria Silva');
  });
});

describe('link builders', () => {
  it('builds a tel: link from E.164', () => {
    expect(telHref(valid.phone_e164)).toBe('tel:+66812345678');
  });

  it('builds a wa.me link without the plus, as WhatsApp requires', () => {
    expect(whatsappHref(valid.phone_e164)).toBe('https://wa.me/66812345678');
  });
});
