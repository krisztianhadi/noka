import { pino, type Logger } from 'pino';
import { getConfig } from '@/config';

/**
 * §4: decrypted values must never reach a log line, and pino's redaction is
 * the backstop. Keys are redacted by name wherever they appear, including
 * inside objects (`*.phone`).
 */
const REDACT = [
  'payload',
  '*.payload',
  'pin',
  '*.pin',
  'phone',
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

let logger: Logger | undefined;

export function getLogger(): Logger {
  logger ??= pino({
    level: getConfig().LOG_LEVEL,
    redact: { paths: REDACT, censor: '[redacted]' },
    base: undefined,
  });
  return logger;
}
