import QRCode from 'qrcode';
import sharp from 'sharp';

/**
 * The card artwork, as a JPEG the dashboard can show immediately.
 *
 * A proper print pipeline (exact ID-1 page boxes, an A4 sheet, an engraving
 * vector) is Phase 7. What exists here is the honest first step he asked for: a
 * card-shaped image, generated server-side from the same data the QR uses, so the
 * owner can see what they are about to print.
 *
 * Geometry: ID-1 is 85.60 × 53.98 mm. This draws it at 300 dpi, portrait artwork
 * on a landscape card (his choice, D30 pending) — 632 × 1011 px.
 */
const DPI = 300;
const MM = DPI / 25.4;
export const CARD_WIDTH_PX = Math.round(53.98 * MM);
export const CARD_HEIGHT_PX = Math.round(85.6 * MM);

export interface CardArtworkInput {
  ownerName: string;
  pin: string;
  url: string;
  languages: string[];
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character,
  );
}

/** The QR as an SVG group, scaled to fit the given box. */
async function qrSvg(url: string, size: number): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    width: size,
  });
  return svg.replace(/<\?xml.*?\?>/, '').trim();
}

/** The whole card as SVG: header, QR, PIN, instructions. */
export async function cardSvg(input: CardArtworkInput): Promise<string> {
  const qrBox = Math.round(CARD_WIDTH_PX * 0.68);
  const qr = await qrSvg(input.url, qrBox);
  const pinSpaced = input.pin;
  const languages = input.languages.join(' · ').toUpperCase();

  const qrX = Math.round((CARD_WIDTH_PX - qrBox) / 2);
  const rule = (y: number) =>
    `<line x1="56" y1="${y}" x2="${CARD_WIDTH_PX - 56}" y2="${y}" stroke="#e2e2e2" stroke-width="2"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" viewBox="0 0 ${CARD_WIDTH_PX} ${CARD_HEIGHT_PX}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${CARD_WIDTH_PX / 2}" y="76" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="bold" fill="#111111">${escapeXml(input.ownerName || 'EMERGENCY')}</text>
  ${rule(98)}
  <g transform="translate(${qrX}, 126)">${qr}</g>
  <text x="${CARD_WIDTH_PX / 2}" y="622" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="28" letter-spacing="4" fill="#555555">PIN</text>
  <text x="${CARD_WIDTH_PX / 2}" y="706" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="bold" letter-spacing="8" fill="#000000">${escapeXml(pinSpaced)}</text>
  ${rule(748)}
  <text x="${CARD_WIDTH_PX / 2}" y="860" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="3" fill="#333333">SCAN · PIN · CALL</text>
  <text x="${CARD_WIDTH_PX / 2}" y="918" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#666666">${escapeXml(languages)}</text>
</svg>`;
}

/** The same artwork as a JPEG, which is what the dashboard displays. */
export async function cardJpeg(input: CardArtworkInput): Promise<Buffer> {
  const svg = await cardSvg(input);
  return sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}
