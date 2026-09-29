import { z } from 'zod';
import { CHANNELS } from '@/lib/channels';
import { RELATIONS } from '@/lib/relations';

/**
 * The encrypted contact payload (§4, D10). Schema 3 adds the reachable
 * **channels** (call, sms, whatsapp, signal, telegram, viber) so the responder
 * page can offer the right action instead of assuming a phone call.
 *
 * One JSON blob per contact: no column names leak metadata, and a new field needs
 * no migration — which is why schema 2 rows still read, upgraded in memory with
 * `call` as the default channel.
 */
export const CONTACT_PAYLOAD_SCHEMA = 3;
const MIN_SCHEMA = 2;

export const contactPayloadSchema = z.object({
  schema: z.number().int().min(MIN_SCHEMA).max(CONTACT_PAYLOAD_SCHEMA),
  name: z.string().min(1),
  relation: z.enum(RELATIONS),
  phone_e164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164, e.g. +66812345678'),
  phone_display: z.string().min(1),
  spoken_languages: z.array(z.string().min(2).max(3)).default([]),
  channels: z.array(z.enum(CHANNELS)).default(['call']),
});

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

export function parseContactPayload(value: unknown): ContactPayload {
  const parsed = contactPayloadSchema.parse(value);
  return { ...parsed, schema: CONTACT_PAYLOAD_SCHEMA, channels: parsed.channels ?? ['call'] };
}

/**
 * An unknown schema version is a hard error, never a partial render: rendering
 * half a contact on an emergency page is worse than showing the generic form.
 */
export function readContactPayload(value: unknown): ContactPayload {
  const version = (value as { schema?: unknown } | null)?.schema;
  if (typeof version !== 'number' || version < MIN_SCHEMA || version > CONTACT_PAYLOAD_SCHEMA) {
    throw new Error(`Unsupported contact payload schema: ${String(version)}`);
  }
  return parseContactPayload(value);
}
