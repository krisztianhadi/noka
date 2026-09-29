/**
 * Install the `@/` resolver for a plain `node` run (see alias-loader.mjs).
 *
 * ESM loader hooks have to be registered from a module, not with a bare `--import`, so
 * this is the shim the npm script points at:
 *
 *     node --import ./scripts/register-alias.mjs scripts/purge.mjs
 */
import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
