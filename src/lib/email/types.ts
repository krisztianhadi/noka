/**
 * Mail, in the smallest shape that can be honest about itself (2026-10-05).
 *
 * noka needs exactly two messages — "reset your password" and, later, "confirm this address" —
 * and it needs them to work in three different worlds: a development machine with no mail
 * provider at all, a hosted instance with a verified sending domain, and a self-hosted instance
 * where the owner is the only account and mail only has to leave a trace. That is a transport
 * with two implementations, not an email framework.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. There is no HTML mail here on purpose: nothing to render, nothing to track. */
  text: string;
}

export interface EmailTransport {
  name: 'log' | 'resend';
  /** `false` only for the log stub: it records the message instead of sending it. */
  delivers: boolean;
  /** Returns the provider's message id, or null when nothing was actually sent. */
  send(message: EmailMessage, from: string): Promise<string | null>;
}
