import type { EmailMessage, EmailTransport } from '@/lib/email/types';

/**
 * Resend, over its REST API — one POST and no SDK.
 *
 * A dependency would be a second thing to keep patched for a single endpoint, and the request is
 * three fields. The API key is read from the environment by the caller and never logged; a failure
 * returns the provider's status in the message (Resend's errors name the problem, usually an
 * unverified sending domain) without echoing the key.
 */
export function createResendTransport(apiKey: string): EmailTransport {
  return {
    name: 'resend',
    delivers: true,
    async send(message: EmailMessage, from: string) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Resend refused the message (${response.status}): ${detail.slice(0, 300)}`);
      }

      const body = (await response.json()) as { id?: string };
      return body.id ?? null;
    },
  };
}
