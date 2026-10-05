import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/config';

/**
 * The half-configured deployment (2026-10-05). Both failures here are the kind that surface at the
 * worst possible moment — a stranger clicking "forgot password" on a live instance, or a "Sign in
 * with Google" button that bounces — so the rule is that the process refuses to start instead, and
 * names every problem at once rather than the first one.
 *
 * `loadConfig` takes an environment bag, so these are pure: no process state is touched.
 */
const base = {
  DATABASE_URL: 'postgres://noka:noka@localhost:5433/noka',
  PUBLIC_CARD_ORIGIN: 'http://localhost:3200',
  VIEW_COOKIE_SECRET: 'x'.repeat(32),
  BETTER_AUTH_SECRET: 'y'.repeat(32),
  CONTACT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  EMAIL_LOOKUP_KEY: 'z'.repeat(32),
  IP_HASH_KEY: 'w'.repeat(32),
};

describe('mail and OAuth configuration', () => {
  it('accepts an instance with no mail provider at all', () => {
    const config = loadConfig(base);
    expect(config.RESEND_API_KEY).toBeUndefined();
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('refuses EMAIL_TRANSPORT=resend without a key and a sender', () => {
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'resend' })).toThrow(/EMAIL_FROM/);
  });

  it('accepts Resend once both are present', () => {
    const config = loadConfig({
      ...base,
      EMAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'noka <no-reply@noka.test>',
    });
    expect(config.EMAIL_TRANSPORT).toBe('resend');
  });

  it('refuses half a Google client', () => {
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_SECRET: 'secret' })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('accepts a Google client pair', () => {
    const config = loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(config.GOOGLE_CLIENT_ID).toBe('id');
  });

  it('still refuses an environment that is missing the things that were always required', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
