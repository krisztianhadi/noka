/**
 * Dark mode, without JavaScript and without a flash of the wrong theme.
 *
 * The choice lives in a cookie and is read during the server render, so the very
 * first byte already carries the right colours. No cookie means "follow the
 * system", which is what the CSS is written to do by default.
 */
export const THEME_COOKIE = 'noka_theme';

export type Theme = 'light' | 'dark';

export function readTheme(value: string | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** A year: a display preference is not a session, and there is nothing private in it. */
export const THEME_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false,
} as const;

export function toggleTarget(current: Theme | null): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
