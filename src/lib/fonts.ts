import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The card's fonts, vendored and pinned.
 *
 * Noto Sans for the five-language heading, Noto Sans Mono for the labels and the
 * PIN, plus a six-kilobyte subset of Noto Sans CJK SC carrying only the ten Chinese
 * characters the card prints. Static instances, generated from the variable fonts
 * with `scripts/make-fonts.py`, so a render is the same on this machine and inside
 * the Alpine container (which has no fonts of its own).
 *
 * librsvg finds fonts through fontconfig, so the first use points fontconfig at our
 * directory by writing a config file. It has to happen before the first text render,
 * which is why this module is imported by the artwork module rather than called from
 * a page.
 */
export const HEADING_FONT = 'Noto Sans';
export const MONO_FONT = 'Noto Sans Mono';

let configured = false;

export function fontDir(): string {
  return process.env.NOKA_FONT_DIR ?? resolve(process.cwd(), 'assets/fonts');
}

export function ensureFonts(): void {
  if (configured) return;
  configured = true;

  const dir = fontDir();
  if (!existsSync(dir)) return; // No vendored fonts: fall back to the system's.

  const cache = join(tmpdir(), 'noka-fontconfig');
  const cacheDir = join(cache, 'cache');
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
    return;
  }

  const conf = join(cache, 'fonts.conf');
  try {
    writeFileSync(
      conf,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <config></config>
</fontconfig>
`,
    );
  } catch {
    return;
  }

  // Only ever point at our own file: the system fonts are not part of a render.
  process.env.FONTCONFIG_FILE = conf;
}
