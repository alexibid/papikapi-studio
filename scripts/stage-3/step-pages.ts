import { readFileSync } from 'node:fs';
import { rgb, type PDFDocument, type PDFPage } from 'pdf-lib';
import type { PieceArtwork } from './interfaces/artwork.interface.js';
import type { BookletFonts, PageFrame, StepEntry } from './interfaces/booklet.interface.js';
import type { NetJoin, Point, StepRender } from './interfaces/net.interface.js';
import type { BookletTexts } from './interfaces/sheet-translations.interface.js';
import { length, midpoint, subtract } from './net-geometry.js';
import {
  ACCENT,
  drawCentredText,
  drawPolygon,
  INK,
  MUTED,
  POINTS_PER_MM,
  WHITE,
  wrapText,
} from './pdf-drawing.js';
import { fillTemplate } from './sheet-translations.js';

const COLUMNS = 2;
const ROWS = 2;
const IMAGE_MM = 78;
const THUMB_MM = 26;
const BODY_MM = 3.3;
const MIN_BODY_MM = 2.4;
const LINE_SPACING = 1.35;
const CELL_PADDING_MM = 6;
const BADGE_MM = 2.3;
const THUMB_FILL = rgb(0.99, 0.86, 0.72);

export class StepPages {
  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: BookletFonts,
    private readonly frame: PageFrame,
    private readonly texts: BookletTexts,
  ) {}

  async render(entries: readonly StepEntry[]): Promise<void> {
    const perPage = COLUMNS * ROWS;
    for (let start = 0; start < entries.length; start += perPage) {
      const page = this.document.addPage([
        this.frame.width * POINTS_PER_MM,
        this.frame.height * POINTS_PER_MM,
      ]);
      this.heading(page);
      const slice = entries.slice(start, start + perPage);
      for (const [index, entry] of slice.entries()) {
        await this.cell(page, entry, this.cellOrigin(index));
      }
    }
  }

  private get cellWidth(): number {
    return (this.frame.width - 2 * this.frame.margin) / COLUMNS;
  }

  private get cellHeight(): number {
    return (this.frame.height - 2 * this.frame.margin - this.frame.header) / ROWS;
  }

  private cellOrigin(index: number): Point {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const top = this.frame.height - this.frame.margin - this.frame.header - row * this.cellHeight;
    return [this.frame.margin + column * this.cellWidth, top];
  }

  private heading(page: PDFPage): void {
    const top = this.frame.height - this.frame.margin - 4;
    page.drawText(this.texts.steps_heading, {
      x: this.frame.margin * POINTS_PER_MM,
      y: top * POINTS_PER_MM,
      size: 5 * POINTS_PER_MM,
      font: this.fonts.bold,
      color: INK,
    });
  }

  private async cell(page: PDFPage, entry: StepEntry, origin: Point): Promise<void> {
    const prefix = this.texts.piece_prefix;
    const title = fillTemplate(this.texts.step_title, {
      step: entry.piece.number,
      piece: `${prefix}${entry.piece.number}`,
    });
    page.drawText(title, {
      x: origin[0] * POINTS_PER_MM,
      y: (origin[1] - 5) * POINTS_PER_MM,
      size: 4.2 * POINTS_PER_MM,
      font: this.fonts.bold,
      color: ACCENT,
    });
    const imageOrigin: Point = [origin[0], origin[1] - 8 - IMAGE_MM];
    const png = await this.document.embedPng(readFileSync(entry.render.image));
    page.drawImage(png, {
      x: imageOrigin[0] * POINTS_PER_MM,
      y: imageOrigin[1] * POINTS_PER_MM,
      width: IMAGE_MM * POINTS_PER_MM,
      height: IMAGE_MM * POINTS_PER_MM,
    });
    this.glueMarks(page, entry.render, imageOrigin);
    this.thumbnail(page, entry.artwork, [
      origin[0] + this.cellWidth - THUMB_MM - 2,
      origin[1] - 8 - THUMB_MM,
    ]);
    this.instructions(page, entry, [origin[0], imageOrigin[1] - 2], origin[1] - this.cellHeight);
  }

  private glueMarks(page: PDFPage, render: StepRender, imageOrigin: Point): void {
    const toPage = (point: Point): Point => [
      imageOrigin[0] + point[0] * IMAGE_MM,
      imageOrigin[1] + point[1] * IMAGE_MM,
    ];
    const badges: Point[] = [];
    for (const mark of render.glue.filter((item) => item.visible)) {
      const a = toPage(mark.a);
      const b = toPage(mark.b);
      page.drawLine({
        start: { x: a[0] * POINTS_PER_MM, y: a[1] * POINTS_PER_MM },
        end: { x: b[0] * POINTS_PER_MM, y: b[1] * POINTS_PER_MM },
        thickness: 1.4,
        color: ACCENT,
      });
      const centre = midpoint(a, b);
      if (badges.some((badge) => length(subtract(badge, centre)) < BADGE_MM * 2.2)) continue;
      badges.push(centre);
      page.drawCircle({
        x: centre[0] * POINTS_PER_MM,
        y: centre[1] * POINTS_PER_MM,
        size: BADGE_MM * POINTS_PER_MM,
        color: WHITE,
        borderColor: ACCENT,
        borderWidth: 0.8,
      });
      drawCentredText(page, this.fonts.bold, String(mark.number), centre, BADGE_MM, 0);
    }
  }

  private thumbnail(page: PDFPage, artwork: PieceArtwork, corner: Point): void {
    const factor = THUMB_MM / Math.max(artwork.width, artwork.height);
    const place = (point: Point): Point => [
      corner[0] + point[0] * factor,
      corner[1] + point[1] * factor,
    ];
    artwork.faces.forEach((face) => drawPolygon(page, face.map(place), THUMB_FILL, INK));
  }

  private instructions(page: PDFPage, entry: StepEntry, top: Point, bottom: number): void {
    const prefix = this.texts.piece_prefix;
    const lines = [
      fillTemplate(this.texts.step_sheet, { sheet: entry.sheet }),
      entry.piece.number === 1 ? this.texts.step_first : this.texts.step_fold,
      ...entry.piece.joins.map((join: NetJoin) =>
        join.piece === entry.piece.number
          ? fillTemplate(this.texts.step_close, { edges: join.edges.join(', ') })
          : fillTemplate(this.texts.step_join, {
              edges: join.edges.join(', '),
              piece: `${prefix}${join.piece}`,
            }),
      ),
    ];
    const available = top[1] - bottom - CELL_PADDING_MM;
    const size = this.fittingSize(lines, available);
    let cursor = top[1];
    for (const [index, line] of lines.entries()) {
      for (const wrapped of wrapText(
        this.fonts.regular,
        line,
        size * POINTS_PER_MM,
        this.textWidth,
      )) {
        cursor -= size * LINE_SPACING;
        page.drawText(wrapped, {
          x: top[0] * POINTS_PER_MM,
          y: cursor * POINTS_PER_MM,
          size: size * POINTS_PER_MM,
          font: this.fonts.regular,
          color: index === 0 ? MUTED : INK,
        });
      }
    }
  }

  private get textWidth(): number {
    return (this.cellWidth - 4) * POINTS_PER_MM;
  }

  private fittingSize(lines: readonly string[], available: number): number {
    for (let size = BODY_MM; size > MIN_BODY_MM; size -= 0.1) {
      const count = lines.reduce(
        (total, line) =>
          total + wrapText(this.fonts.regular, line, size * POINTS_PER_MM, this.textWidth).length,
        0,
      );
      if (count * size * LINE_SPACING <= available) return size;
    }
    return MIN_BODY_MM;
  }
}
