/// <reference types="astro/client" />

/**
 * Middleware puts the owner session here for `/dashboard/*`, so a page never
 * has to re-derive it (src/middleware.ts).
 */
declare namespace App {
  interface Locals {
    owner?: {
      id: string;
      name: string;
      email: string;
    };
    /** The owner's theme choice, read from the cookie during rendering (src/lib/theme.ts). */
    theme: 'light' | 'dark' | null;
    /** The owner plane's language: cookie, else the device, else English (src/lib/locale.ts). */
    locale: import('@/i18n/languages').CardLanguage;
  }
}
