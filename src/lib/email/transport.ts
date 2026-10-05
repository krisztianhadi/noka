import { getConfig } from '@/config';
import { getLogger } from '@/lib/logger';
import { createLogTransport } from '@/lib/email/log';
import { createResendTransport } from '@/lib/email/resend';
import type { EmailTransport } from '@/lib/email/types';

export type { EmailMessage, EmailTransport } from '@/lib/email/types';

/**
 * Which transport this deployment would use, and whether that choice can actually deliver.
 *
 * Pure on purpose: it never touches the network and never logs, so a test — or a boot check — can
 * ask "would mail work here?" without sending anything. Resolution: `EMAIL_TRANSPORT` wins when it
 * is set; otherwise Resend when a key is present, and the log stub when it is not, so a deployment
 * that sets nothing keeps working exactly as it did before transports existed.
 *
 * The cross-field requirement (resend needs a key *and* a from-address) lives in `src/config.ts`,
 * where a bad deployment already fails at boot with every problem listed at once.
 */
export interface TransportChoice {
  name: 'log' | 'resend';
  /** `false` for the log stub: a message is recorded rather than sent. */
  delivers: boolean;
}

export function readTransportChoice(
  env: Record<string, string | undefined> = process.env,
): TransportChoice {
  const explicit = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (explicit === 'resend') return { name: 'resend', delivers: true };
  if (explicit === 'log') return { name: 'log', delivers: false };

  // Nothing said: the key decides, and no key means the stub. A deployment that sets nothing is
  // unchanged by an upgrade.
  const name = env.RESEND_API_KEY?.trim() ? 'resend' : 'log';
  return { name, delivers: name === 'resend' };
}

let cached: EmailTransport | undefined;

/** The transport for this process, resolved once. */
export function emailTransport(): EmailTransport {
  if (!cached) {
    const choice = readTransportChoice();
    cached = choice.name === 'resend' ? createResendTransport(getConfig().RESEND_API_KEY!) : createLogTransport();
    getLogger().info({ transport: choice.name, delivers: choice.delivers }, 'email transport');
  }
  return cached;
}

/** The From: header, with a development fallback that never pretends to be a real domain. */
export function emailFrom(): string {
  return getConfig().EMAIL_FROM ?? 'noka <no-reply@localhost>';
}
