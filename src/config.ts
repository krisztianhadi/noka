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
  // Mail (2026-10-05). Optional, and the default is honest: without a key, "sending" a message
  // writes it to the log, where a developer can click the link — which is also the only shape a
  // solo self-hosted instance needs, since nobody has to receive mail to sign in.
  EMAIL_TRANSPORT: z.enum(['log', 'resend']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** The From: header. Resend refuses a sender on a domain the account has not verified. */
  EMAIL_FROM: z.string().min(3).optional(),
  // Google sign-in (2026-10-05). Both or neither; the button only appears when they are set.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  // A half-configured deployment must fail at boot, not when a stranger clicks "forgot password".
  if (env.EMAIL_TRANSPORT === 'resend') {
    if (!env.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'is required when EMAIL_TRANSPORT=resend' });
    }
    if (!env.EMAIL_FROM) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'is required when EMAIL_TRANSPORT=resend' });
    }
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_ID'],
      message: 'and GOOGLE_CLIENT_SECRET are both or neither — a client id without its secret cannot sign anyone in',
    });
  }
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
