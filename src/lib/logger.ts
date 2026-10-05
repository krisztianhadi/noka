import { pino, type DestinationStream, type Logger } from 'pino';
import { getConfig } from '@/config';

/**
 * §4: decrypted values must never reach a log line, and pino's redaction is
 * the backstop. Keys are redacted by name wherever they appear, including
 * inside objects (`*.phone`).
 *
 * The rule it enforces is narrow and worth stating: this covers **our** log calls. Astro
 * logs an unhandled error itself, with its own logger, and that output is not redacted —
 * which is why the throw sites in this codebase interpolate limits, key versions and
 * config names, never a payload, a number or a name (checked 2026-10-05; the one log
 * call site in `src/lib/responder.ts` passes an error and a card id).
 */
const REDACT = [
  'payload',
  '*.payload',
  'phone',
  'pin',
  '*.pin',
  '*.phone',
  'phone_e164',
  '*.phone_e164',
  'notes',
  '*.notes',
  'password',
  '*.password',
  'req.headers.cookie',
  'req.headers.authorization',
];

/**
 * Build a logger. `destination` exists so a test can capture what a log line actually
 * contains — the redaction is the kind of thing that looks right in review and is wrong
 * in the output. Production calls it with no argument and writes to stdout.
 */
export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: getConfig().LOG_LEVEL,
      redact: { paths: REDACT, censor: '[redacted]' },
      base: undefined,
    },
    destination,
  );
}

let logger: Logger | undefined;

export function getLogger(): Logger {
  logger ??= createLogger();
  return logger;
}
