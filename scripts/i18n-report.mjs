#!/usr/bin/env node
/**
 * Translation coverage per language.
 *
 *     pnpm i18n:report
 *
 * Prints how many keys each language file has against English, and names what is missing.
 * The build already fails on a missing key (the files are typed as `Record<MessageKey, string>`),
 * so this is the friendly version for a translator working on a partial file — and the thing
 * to paste into a pull request.
 *
 * Read with a regex rather than imported: a half-finished file does not have to compile for
 * somebody to see how far along it is.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/i18n/locales/', import.meta.url));
const keysOf = (source) => [...source.matchAll(/^  '([^']+)':/gm)].map((match) => match[1] ?? '');

const english = keysOf(await readFile(`${dir}en.ts`, 'utf8'));
const files = (await readdir(dir)).filter((name) => name.endsWith('.ts') && name !== 'index.ts');
let incomplete = 0;

for (const file of files.sort()) {
  const code = file.replace(/\.ts$/, '');
  const keys = keysOf(await readFile(dir + file, 'utf8'));
  const missing = english.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !english.includes(key));
  const percent = ((keys.length / english.length) * 100).toFixed(0).padStart(3);
  const mark = missing.length === 0 && extra.length === 0 ? '✓' : '·';
  console.log(`${mark} ${code.padEnd(3)} ${keys.length}/${english.length} keys (${percent}%)`);
  if (missing.length > 0) {
    incomplete += 1;
    console.log(`    missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` … +${missing.length - 8}` : ''}`);
  }
  if (extra.length > 0) console.log(`    unknown keys: ${extra.slice(0, 8).join(', ')}`);
}

console.log(incomplete === 0 ? '\nAll languages complete.' : `\n${incomplete} language(s) have gaps.`);
