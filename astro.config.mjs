import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// noka — next of kin access. Functionality first: no client framework, and no
// scripts, fonts or third-party requests on the responder pages.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Astro's own sessions are not used: the guest cookie is signed by hand
  // (VIEW_COOKIE_SECRET) and the owner plane uses better-auth's DB sessions.
  session: false,
  security: {
    // Astro's global Origin check would 403 the guest PIN form in any browser
    // or webview that omits `Origin` — and the emergency page must not depend
    // on a header. Every owner-plane POST does its own same-origin check in
    // src/lib/http.ts instead (ADR-014).
    checkOrigin: false,
  },
  // The dev toolbar injects scripts; the responder plane must be provably
  // script-free, in dev as well as in production.
  devToolbar: { enabled: false },
  build: {
    // §9: one request to render the responder page. A separate stylesheet would
    // also be blocked by the responder plane's own CSP (style-src 'unsafe-inline').
    inlineStylesheets: 'always',
  },
  vite: {
    // Tailwind styles the owner plane (ADR-028). It is imported by the owner
    // layout only, so the responder page never carries a utility framework —
    // Tailwind emits just the utilities a page actually uses, and that page
    // uses none.
    plugins: [tailwindcss()],
  },
  server: {
    // 3200 keeps clear of ghosted (:3000) and kaja (:3100).
    port: 3200,
    // Bind on all interfaces so a real phone can scan a printed QR over LAN.
    host: true,
  },
});
