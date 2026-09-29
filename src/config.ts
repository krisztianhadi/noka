import { z } from 'zod';

/**
 * The only module that reads process.env (§16). Everything else imports
 * getConfig(), so the inventory cannot drift away from the code by accident.
 *
 * Validation is lazy on purpose: `astro build` imports route modules without
 * a runtime environment, and a module-level throw would break the build
 * instead of the request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'is required'),
  PUBLIC_CARD_ORIGIN: z
    .string()
    .min(1, 'is required')
    .refine((value) => /^https?:\/\/[^/\s]+$/.test(value), 'must be an origin, e.g. https://noka.example'),
  VIEW_COOKIE_SECRET: z.string().min(32, 'must be at least 32 characters'),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Optional: better-auth falls back to the card origin when it is absent.
  BETTER_AUTH_URL: z.string().optional(),
  CONTACT_ENCRYPTION_KEY: z
    .string()
    .min(1, 'is required')
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64'),
  EMAIL_LOOKUP_KEY: z.string().min(32, 'must be at least 32 characters'),
  IP_HASH_KEY: z.string().min(32, 'must be at least 32 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().positive().default(3200),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment — ${problems}. See .env.example.`);
  }
  return parsed.data;
}

let cached: Config | undefined;

/** Memoised, validated configuration. Throws on the first call if invalid. */
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
