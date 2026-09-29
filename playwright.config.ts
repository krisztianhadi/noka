import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + accessibility checks. Local runs reuse the dev server on :3200
 * (3200 keeps clear of ghosted :3000 and kaja :3100).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    // 127.0.0.1, not localhost: `localhost` can resolve to ::1 first, which
    // makes Playwright think no server is running and fail to start its own.
    baseURL: 'http://127.0.0.1:3200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The built server, not `astro dev`: dev injects the Vite/HMR client, and
    // the zero-JavaScript assertion is only meaningful in production output.
    command: 'pnpm build && node --env-file-if-exists=.env ./dist/server/entry.mjs',
    url: 'http://127.0.0.1:3200/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
