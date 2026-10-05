import { describe, expect, it } from 'vitest';
import { createLogTransport } from '@/lib/email/log';
import { readTransportChoice } from '@/lib/email/transport';

/**
 * The rule that decides whether a password reset actually reaches a person (2026-10-05).
 *
 * It is worth a test because both directions are silent failures: resolving to `log` on a deployed
 * instance means nobody ever receives the mail and nothing complains, and resolving to `resend` on
 * a development machine means the suite starts calling a paid API. The default has to be the stub.
 */
describe('the email transport choice', () => {
  it('defaults to the log stub when nothing is configured', () => {
    expect(readTransportChoice({})).toEqual({ name: 'log', delivers: false });
  });

  it('takes Resend when a key is present', () => {
    expect(readTransportChoice({ RESEND_API_KEY: 're_test' })).toEqual({ name: 'resend', delivers: true });
  });

  it('lets an explicit choice win over the key', () => {
    // A key on the machine is not consent to spend money in dev, and log on a deployment is a
    // deliberate "I will read the log" choice.
    expect(readTransportChoice({ EMAIL_TRANSPORT: 'log', RESEND_API_KEY: 're_test' })).toEqual({
      name: 'log',
      delivers: false,
    });
    expect(readTransportChoice({ EMAIL_TRANSPORT: 'resend' })).toEqual({ name: 'resend', delivers: true });
  });

  it('is case- and whitespace-tolerant, because a shell writes what it writes', () => {
    expect(readTransportChoice({ EMAIL_TRANSPORT: ' Resend ' }).name).toBe('resend');
  });
});

describe('the log transport', () => {
  it('records the message instead of sending it, and says so', async () => {
    const lines: string[] = [];
    const transport = createLogTransport((_context, message) => lines.push(message));

    expect(transport.delivers).toBe(false);

    const id = await transport.send(
      { to: 'owner@noka.test', subject: 'Reset your noka password', text: 'If it was you: https://noka.test/reset?token=abc' },
      'noka <no-reply@localhost>',
    );

    expect(id).toBeNull();
    expect(lines.join('\n')).toContain('https://noka.test/reset?token=abc');
    expect(lines.join('\n')).toContain('[email — log transport, nothing sent]');
  });
});
