/**
 * Let a plain `node` script import the app's source the way the app does.
 *
 * TypeScript in this repo is written for a bundler: `@/foo` is a path alias and relative
 * imports have no extension. Node 22 strips types by itself but resolves neither, so
 * `scripts/purge.mjs` could not use `src/lib/retention.ts` — and a purge script that
 * re-implements its own SQL would mean the tested code is not the code that runs.
 *
 *     node --import ./scripts/register-alias.mjs scripts/purge.mjs
 *
 * Only the alias, the extension and the directory index are resolved; everything else is
 * left to Node.
 */
import { access } from 'node:fs/promises';

const SOURCE_ROOT = new URL('../src/', import.meta.url).href;
const EXTENSIONS = ['', '.ts', '/index.ts'];

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await access(new URL(candidate));
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = SOURCE_ROOT + specifier.slice(2);
    const found = await firstExisting(EXTENSIONS.map((extension) => base + extension));
    if (found) return next(found, context);
  }

  const fromSource = context.parentURL?.startsWith(SOURCE_ROOT) ?? false;
  if (fromSource && specifier.startsWith('.')) {
    const base = new URL(specifier, context.parentURL).href;
    const found = await firstExisting(EXTENSIONS.map((extension) => base + extension));
    if (found) return next(found, context);
  }

  return next(specifier, context);
}
