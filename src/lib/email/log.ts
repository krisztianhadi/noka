import { getLogger } from '@/lib/logger';
import type { EmailMessage, EmailTransport } from '@/lib/email/types';

/**
 * Where a logged message goes; injectable so a test can read it instead of the terminal.
 */
export type EmailLogSink = (context: Record<string, unknown>, message: string) => void;

/**
 * The stub transport: the message goes to the log, and nothing leaves the machine.
 *
 * This is the default, and it is the right default for two of the three worlds: a development
 * machine (the reset link is in the terminal, one click away) and a solo self-hosted instance
 * (with registration closed, nobody needs mail to arrive). `delivers: false` is what a caller can
 * check before claiming a message was sent.
 */
export function createLogTransport(log: EmailLogSink = getLogger().info.bind(getLogger())): EmailTransport {
  return {
    name: 'log',
    delivers: false,
    async send(message: EmailMessage, from: string) {
      log(
        { to: message.to, from, subject: message.subject },
        `[email — log transport, nothing sent] ${message.subject}\n\n${message.text}`,
      );
      return null;
    },
  };
}
