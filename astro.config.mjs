import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// noka — next of kin access. Functionality first: no client framework, no
// design pass, no scripts on the responder pages.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Astro's own sessions are not used: the guest cookie is signed by hand
  // (VIEW_COOKIE_SECRET) and the owner plane uses better-auth's DB sessions.
  session: false,
  // The dev toolbar injects scripts; the responder plane must be provably
  // script-free, in dev as well as in production.
  devToolbar: { enabled: false },
  server: {
    // 3200 keeps clear of ghosted (:3000) and kaja (:3100).
    port: 3200,
    // Bind on all interfaces so a real phone can scan a printed QR over LAN.
    host: true,
  },
});
