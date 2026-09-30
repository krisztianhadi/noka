import { degrees, PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { cardSvg } from '@/lib/card-artwork';

/**
 * Print masters for the card (Phase 7).
 *
 * Three files, because there are three ways people actually print:
 *
 * - **card** — one page, exactly 53.98 × 85.60 mm (ISO/IEC 7810 ID-1, the size of a bank card),
 *   for a print shop or a cutting machine that wants the finished object and nothing else.
 * - **a4** — one card on A4 with corner marks, for printing at home and cutting out.
 * - **sheet** — ten cards on A4 with corner marks, for printing a stack in one go.
 *
 * The artwork goes in as a raster at `DPI`, which is how the card is designed anyway (300 dpi
 * gives 638 × 1011 px). It is rendered at 600 dpi for print: the SVG is vector, so this is real
 * detail rather than an upscale, and a phone camera reading a QR code out of 600 dpi has room to
 * spare. One image is embedded once per document and drawn as many times as the layout needs,
 * so the ten-card sheet costs the same as the single card.
 */
const DPI = 600;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

/** ISO/IEC 7810 ID-1: the bank-card size this is meant to be. */
export const CARD_MM = { width: 53.98, height: 85.6 } as const;
/** ISO 216 A4. */
export const A4_MM = { width: 210, height: 297 } as const;

export const mm = (value: number): number => (value / MM_PER_INCH) * PT_PER_INCH;

/** Visible paper edge: home printers cannot print to the edge, so nothing important is near it. */
const SHEET_MARGIN_MM = 8;
/** Between cards on a sheet: the cut line and nothing more. Two millimetres is what five rows of
 *  a rotated card need to fit inside A4's printable area — at four the sheet loses a card. */
const GAP_MM = 2;
const MARK_LENGTH_MM = 4;
const MARK_COLOR = rgb(0.72, 0.72, 0.72);

export type CardPdfLayout = 'card' | 'a4' | 'sheet';

export interface CardPdfInput {
  pin: string;
  url: string;
  languages: string[];
}

export const LAYOUTS: readonly CardPdfLayout[] = ['card', 'a4', 'sheet'];

export function isLayout(value: string | null): value is CardPdfLayout {
  return value === 'card' || value === 'a4' || value === 'sheet';
}

/**
 * How many cards fit on A4 decently, rotated a quarter turn.
 *
 * Portrait cards put three across and three down (nine) because 54 mm only divides into 210 mm
 * three times. Rotated, 85.6 mm divides twice and 54 mm divides five times, so ten fit with
 * 23 mm of margin left over horizontally — more room than the portrait grid has, and one more
 * card than the ten-to-twelve he asked for as a floor. The card is the same object either way;
 * it just comes off the sheet sideways.
 */
export function sheetGrid(): { columns: number; rows: number; count: number } {
  const usableWidth = A4_MM.width - 2 * SHEET_MARGIN_MM;
  const usableHeight = A4_MM.height - 2 * SHEET_MARGIN_MM;
  const columns = Math.floor((usableWidth + GAP_MM) / (CARD_MM.height + GAP_MM));
  const rows = Math.floor((usableHeight + GAP_MM) / (CARD_MM.width + GAP_MM));
  return { columns, rows, count: columns * rows };
}

/** How many cards the sheet layout places. */
export function countOnSheet(): number {
  return sheetGrid().count;
}

/** The card as a JPEG at print resolution, once per document. */
async function cardImage(input: CardPdfInput): Promise<Uint8Array> {
  const svg = await cardSvg(input);
  const jpeg = await sharp(Buffer.from(svg), { density: DPI })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return new Uint8Array(jpeg);
}

/**
 * Four corner ticks around a card, in the paper's own colour space rather than the card's: they
 * are cut marks, so they sit just outside the edge and never print under the artwork.
 */
function cornerMarks(
  page: ReturnType<PDFDocument['addPage']>,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const mark = mm(MARK_LENGTH_MM);
  const gap = mm(1.5);
  const thickness = 0.4;
  const corners: Array<[number, number, number, number]> = [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x, y + height, 1, -1],
    [x + width, y + height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    page.drawLine({
      start: { x: cx + dx * gap, y: cy },
      end: { x: cx + dx * (gap + mark), y: cy },
      thickness,
      color: MARK_COLOR,
    });
    page.drawLine({
      start: { x: cx, y: cy + dy * gap },
      end: { x: cx, y: cy + dy * (gap + mark) },
      thickness,
      color: MARK_COLOR,
    });
  }
}

/** A page exactly the size of the card, with the artwork filling it edge to edge. */
async function exactCardPage(image: Uint8Array): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('noka card');
  pdf.setCreator('noka');
  const page = pdf.addPage([mm(CARD_MM.width), mm(CARD_MM.height)]);
  const embedded = await pdf.embedJpg(image);
  page.drawImage(embedded, { x: 0, y: 0, width: mm(CARD_MM.width), height: mm(CARD_MM.height) });
  return pdf;
}

/** One card on A4, centred, with corner marks. */
async function singleOnA4(image: Uint8Array): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('noka card — A4');
  pdf.setCreator('noka');
  const page = pdf.addPage([mm(A4_MM.width), mm(A4_MM.height)]);
  const embedded = await pdf.embedJpg(image);
  const width = mm(CARD_MM.width);
  const height = mm(CARD_MM.height);
  const x = (mm(A4_MM.width) - width) / 2;
  const y = (mm(A4_MM.height) - height) / 2;
  page.drawImage(embedded, { x, y, width, height });
  cornerMarks(page, x, y, width, height);
  return pdf;
}

/** As many cards as fit: `sheetGrid()` of them, rotated, with corner marks on every one. */
async function sheetOnA4(image: Uint8Array): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('noka cards — A4 sheet');
  pdf.setCreator('noka');
  const page = pdf.addPage([mm(A4_MM.width), mm(A4_MM.height)]);
  const embedded = await pdf.embedJpg(image);

  const { columns, rows } = sheetGrid();
  // Rotated, so the card's height is the sheet's width for layout purposes.
  const cellWidth = mm(CARD_MM.height);
  const cellHeight = mm(CARD_MM.width);
  const gap = mm(GAP_MM);
  const gridWidth = columns * cellWidth + (columns - 1) * gap;
  const gridHeight = rows * cellHeight + (rows - 1) * gap;
  const startX = (mm(A4_MM.width) - gridWidth) / 2;
  const startY = (mm(A4_MM.height) - gridHeight) / 2;

  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const x = startX + column * (cellWidth + gap);
      const y = startY + row * (cellHeight + gap);
      // `rotate` turns the artwork a quarter turn anticlockwise about the image's origin, so the
      // placement is expressed in the rotated frame: x runs up the page, y runs across it.
      page.drawImage(embedded, {
        x: x + cellWidth,
        y,
        width: cellHeight,
        height: cellWidth,
        rotate: degrees(90),
      });
      cornerMarks(page, x, y, cellWidth, cellHeight);
    }
  }
  return pdf;
}

/** The print master for one layout. Returns the PDF bytes. */
export async function cardPdf(input: CardPdfInput, layout: CardPdfLayout): Promise<Uint8Array> {
  const image = await cardImage(input);
  const pdf =
    layout === 'card'
      ? await exactCardPage(image)
      : layout === 'a4'
        ? await singleOnA4(image)
        : await sheetOnA4(image);
  return pdf.save();
}
