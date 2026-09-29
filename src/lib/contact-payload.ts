import { z } from 'zod';
import { RELATIONS } from '@/lib/relations';

/**
 * The encrypted contact payload (§4, D10, schema 2).
 *
 * One JSON blob per contact: no column names leak metadata, new fields need no
 * migration, and the relation is a vocabulary code rather than the owner's
 * phrase so the responder page can translate it (D31).
 */
export const CONTACT_PAYLOAD_SCHEMA = 2;

export const contactPayloadSchema = z.object({
  schema: z.literal(CONTACT_PAYLOAD_SCHEMA),
  name: z.string().min(1),
  relation: z.enum(RELATIONS),
  phone_e164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164, e.g. +66812345678'),
  phone_display: z.string().min(1),
  spoken_languages: z.array(z.string().min(2).max(3)).default([]),
});

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

export function parseContactPayload(value: unknown): ContactPayload {
  return contactPayloadSchema.parse(value);
}

/**
 * An unknown schema version is a hard error, never a partial render: rendering
 * half a contact on an emergency page is worse than showing the generic form.
 */
export function readContactPayload(value: unknown): ContactPayload {
  const version = (value as { schema?: unknown } | null)?.schema;
  if (version !== CONTACT_PAYLOAD_SCHEMA) {
    throw new Error(`Unsupported contact payload schema: ${String(version)}`);
  }
  return parseContactPayload(value);
}

/** `tel:` needs the raw E.164; `wa.me` needs it without the plus. */
export function telHref(phoneE164: string): string {
  return `tel:${phoneE164}`;
}

export function whatsappHref(phoneE164: string): string {
  return `https://wa.me/${phoneE164.replace(/^\+/, '')}`;
}
