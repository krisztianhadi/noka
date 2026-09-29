import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * `.env` is loaded here so `pnpm test` is self-sufficient locally: the
 * integration tests need DATABASE_URL, and CI supplies the same names as real
 * environment variables.
 */
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    env,
    testTimeout: 30_000,
  },
});
