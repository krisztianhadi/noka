import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

/**
 * Phase 0 spike, kept as a regression test (ADR-017): a reprint must be
 * byte-comparable for the same card revision (D16, D29).
 *
 * Standard fonts only, so this is hermetic — the font-dependent half of the
 * spike lives in scripts/spike-pdf.mjs and becomes a real test in Phase 7, once
 * the OFL Noto files are vendored into the repository.
 */
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

async function render({ withMetadata }: { withMetadata: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([53.98 * 2.834645669, 85.6 * 2.834645669]);

  page.drawText('Krisztian', { x: 12, y: 200, size: 18, font, color: rgb(0, 0, 0) });
  page.drawText('SCAN PIN CALL', { x: 12, y: 180, size: 9, font });

  if (withMetadata) {
    doc.setCreationDate(FIXED_DATE);
    doc.setModificationDate(FIXED_DATE);
    doc.setProducer('noka');
    doc.setCreator('noka');
  }
  return doc.save();
}

describe('PDF determinism', () => {
  it('renders the same bytes twice for the same content', async () => {
    const first = await render({ withMetadata: false });
    const second = await render({ withMetadata: false });
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it('stays deterministic with fixed dates and producer metadata', async () => {
    const first = await render({ withMetadata: true });
    const second = await render({ withMetadata: true });
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it('writes no random /ID and no timestamped dates on its own', async () => {
    const bytes = Buffer.from(await render({ withMetadata: false })).toString('latin1');
    expect(bytes).not.toContain('/ID');
    expect(bytes).not.toMatch(/\/CreationDate/);
    expect(bytes).not.toMatch(/\/ModDate/);
  });

  it('produces a plausible ID-1 page box', async () => {
    const doc = await PDFDocument.load(await render({ withMetadata: true }));
    const [page] = doc.getPages();
    expect(page?.getWidth()).toBeCloseTo(153, 0);
    expect(page?.getHeight()).toBeCloseTo(242.6, 0);
  });

  it('round-trips the dates we set, and lets pdf-lib keep its own constant producer', async () => {
    const doc = await PDFDocument.load(await render({ withMetadata: true }));
    expect(doc.getCreationDate()?.toISOString()).toBe(FIXED_DATE.toISOString());
    expect(doc.getCreator()).toBe('noka');
    // pdf-lib stamps its own /Producer at save time; it is a constant, so it
    // does not threaten determinism, but the printed file does advertise it.
    expect(doc.getProducer()).toContain('pdf-lib');
  });
});
