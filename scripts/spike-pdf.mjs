/**
 * Phase 0 spike: can the printed card be byte-deterministic? (D16, D29)
 *
 * Renders the same minimal card-sized page twice and reports exactly what
 * differs, then applies the candidate fixes one at a time. Run with:
 *
 *   node scripts/spike-pdf.mjs
 *
 * Not part of the build — this is the evidence behind ADR-017.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FONT_CANDIDATES = [
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
  '/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf',
];

const A4_MM = { width: 53.98 * 2.834645669, height: 85.60 * 2.834645669 }; // ID-1 portrait artwork
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

function firstDifference(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      return { offset: index, a: a.subarray(index, index + 24).toString('latin1'), b: b.subarray(index, index + 24).toString('latin1') };
    }
  }
  return a.length === b.length ? null : { offset: length, a: '(end)', b: '(end)' };
}

async function render({ font, fixedDates, subset, customName }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const page = doc.addPage([A4_MM.width, A4_MM.height]);
  const embedded = font
    ? await doc.embedFont(readFileSync(font), { subset, ...(customName ? { customName } : {}) })
    : await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('Krisztian', { x: 12, y: A4_MM.height - 40, size: 18, font: embedded, color: rgb(0, 0, 0) });
  page.drawText('SCAN · PIN · CALL', { x: 12, y: A4_MM.height - 60, size: 9, font: embedded });

  if (fixedDates) {
    doc.setCreationDate(FIXED_DATE);
    doc.setModificationDate(FIXED_DATE);
    doc.setProducer('noka');
    doc.setCreator('noka');
  }
  return doc.save();
}

async function compare(label, options) {
  const first = await render(options);
  const second = await render(options);
  const same = Buffer.compare(Buffer.from(first), Buffer.from(second)) === 0;
  const diff = same ? null : firstDifference(Buffer.from(first), Buffer.from(second));
  console.log(
    `${same ? 'IDENTICAL' : 'differ    '}  ${label.padEnd(46)} ${first.length} bytes  ${digest(first)}`,
  );
  if (diff) {
    console.log(`             first difference at byte ${diff.offset}:`);
    console.log(`               #1 ${JSON.stringify(diff.a)}`);
    console.log(`               #2 ${JSON.stringify(diff.b)}`);
  }
  return { same, bytes: first.length };
}

const font = FONT_CANDIDATES.find((candidate) => {
  try {
    readFileSync(candidate);
    return true;
  } catch {
    return false;
  }
});

console.log(`font: ${font ?? 'standard Helvetica'}\n`);
console.log('two renders of the same page:');
await compare('standard font, default metadata', { font: null });
await compare('standard font, fixed dates + producer', { font: null, fixedDates: true });
if (font) {
  await compare('embedded font, subset, default metadata', { font, subset: true });
  await compare('embedded font, subset, fixed dates', { font, subset: true, fixedDates: true });
  await compare('embedded font, NOT subset, fixed dates', { font, subset: false, fixedDates: true });
  await compare('embedded font, subset + fixed dates + customName', {
    font,
    subset: true,
    fixedDates: true,
    customName: 'NotoSans',
  });
}

console.log('\nwhat the bytes say about the ID and the dates:');
const withDates = Buffer.from(await render({ font, subset: true, fixedDates: true })).toString('latin1');
console.log('  /ID present:', withDates.includes('/ID'));
console.log('  CreationDate:', /\/CreationDate\s*\(([^)]*)\)/.exec(withDates)?.[1] ?? '(absent)');
console.log('  ModDate:', /\/ModDate\s*\(([^)]*)\)/.exec(withDates)?.[1] ?? '(absent)');
console.log('  font prefix:', /\/BaseFont\s*\/([A-Z]{6}\+)?/.exec(withDates)?.[1] ?? '(none)');
