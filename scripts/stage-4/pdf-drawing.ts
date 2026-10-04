import { degrees, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import type { LineStyle } from './interfaces/booklet.interface.js';
import type { Point } from './interfaces/net.interface.js';
import type { LegendKind } from './interfaces/sheet-translations.interface.js';

export const POINTS_PER_MM = 72 / 25.4;
export const INK = rgb(0.08, 0.08, 0.08);
export const MUTED = rgb(0.42, 0.42, 0.42);
export const TAB_FILL = rgb(0.86, 0.86, 0.86);
export const ACCENT = rgb(0.86, 0.33, 0.05);
export const WHITE = rgb(1, 1, 1);

export const LINE_STYLES: Readonly<Record<LegendKind, LineStyle>> = {
  cut: { thickness: 0.8, color: INK },
  mountain: { thickness: 0.6, color: INK, dashArray: [4, 1.6, 0.8, 1.6] },
  valley: { thickness: 0.6, color: INK, dashArray: [2.4, 1.6] },
  tab: { thickness: 0.5, color: MUTED, dashArray: [1.2, 1.2] },
};

export const toPoints = (point: Point): { x: number; y: number } => ({
  x: point[0] * POINTS_PER_MM,
  y: point[1] * POINTS_PER_MM,
});

export function drawSegment(page: PDFPage, a: Point, b: Point, style: LineStyle): void {
  page.drawLine({
    start: toPoints(a),
    end: toPoints(b),
    thickness: style.thickness,
    color: style.color,
    dashArray: style.dashArray ? [...style.dashArray] : undefined,
  });
}

export function drawPolygon(
  page: PDFPage,
  points: readonly Point[],
  fill: Color,
  border?: Color,
): void {
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point[0] * POINTS_PER_MM} ${-point[1] * POINTS_PER_MM}`,
    )
    .join(' ');
  page.drawSvgPath(`${path} Z`, {
    x: 0,
    y: 0,
    color: fill,
    borderColor: border,
    borderWidth: border ? 0.5 : 0,
  });
}

export function drawCentredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  at: Point,
  sizeMm: number,
  angle: number,
  color: Color = INK,
): void {
  const size = sizeMm * POINTS_PER_MM;
  const width = font.widthOfTextAtSize(text, size);
  const along = [Math.cos(angle), Math.sin(angle)];
  const across = [-along[1], along[0]];
  const origin = toPoints(at);
  page.drawText(text, {
    x: origin.x - (along[0] * width) / 2 - across[0] * size * 0.35,
    y: origin.y - (along[1] * width) / 2 - across[1] * size * 0.35,
    size,
    font,
    color,
    rotate: degrees((angle * 180) / Math.PI),
  });
}

export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
