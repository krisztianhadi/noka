import { describe, expect, it } from 'vitest';
import { createLogger } from '@/lib/logger';

/**
 * The redaction is the last line between a decrypted contact and a log file that outlives
 * the database (PLAN §4, §5). It is also the kind of configuration that reads correctly
 * and behaves differently, so this asserts on the bytes a log line actually contains
 * rather than on the list of paths someone remembered to write down.
 *
 * The positive assertion matters as much as the negative ones: a logger that redacted
 * everything would also pass "no phone number in the output", and would be useless.
 */
function capture(): { write: (chunk: string) => boolean; output: () => string } {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    output: () => chunks.join(''),
  };
}

describe('logger redaction', () => {
  it('keeps a decrypted contact out of the line it writes', () => {
    const sink = capture();
    const logger = createLogger(sink);

    logger.error(
      {
        err: new Error('pin attempt not recorded'),
        cardId: 'card-9f2c41',
        payload: {
          name: 'Anong',
          phone: '+66891234567',
          phone_e164: '+66891234567',
          notes: 'allergic to penicillin',
          spoken: ['th'],
        },
        phone: '+66891234567',
        pin: '482913',
        password: 'correct-horse-battery',
      },
      'pin attempt not recorded',
    );

    const line = sink.output();

    expect(line).not.toContain('+66891234567');
    expect(line).not.toContain('482913');
    expect(line).not.toContain('allergic to penicillin');
    expect(line).not.toContain('correct-horse-battery');
    expect(line).not.toContain('Anong');
    expect(line).toContain('[redacted]');

    // What is left has to be worth reading: the card id is how an operator finds the row.
    expect(line).toContain('card-9f2c41');
    expect(line).toContain('pin attempt not recorded');
  });
});
