import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + accessibility checks.
 *
 * **The suite owns its server.** It builds and starts its own on :3300, and never
 * reuses one that happens to be running. That is not tidiness: when a server was
 * already listening, `reuseExistingServer` skipped the build as well, so the suite
 * silently tested a stale build and reported failures the current code did not have
 * (or passed code it did not have either). Three separate verification mistakes in
 * one session came from exactly that.
 *
 * :3300 is deliberate — :3000 is ghosted, :3100 kaja, :3200 the dev server this repo
 * runs by hand. A port nobody else uses means the suite can always start clean.
 *
 * It also builds into its **own** output directory (`dist-e2e`). Building into the
 * shared `dist/` while a dev server was running deleted the page chunks that server
 * still referenced, so every page it served answered 500 — "login is broken" was
 * exactly that. Separate ports were not enough; the build output had to be separate
 * too.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    // 127.0.0.1, not localhost: `localhost` can resolve to ::1 first, which makes
    // Playwright think no server is running and fail to start its own.
    baseURL: 'http://127.0.0.1:3300',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The built server, not `astro dev`: dev injects the Vite/HMR client, and the
    // zero-JavaScript assertion is only meaningful in production output.
    command:
      'NOKA_OUT_DIR=dist-e2e pnpm build && node --env-file-if-exists=.env ./dist-e2e/server/entry.mjs',
    url: 'http://127.0.0.1:3300/healthz',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: '3300', HOST: '127.0.0.1' },
  },
});
