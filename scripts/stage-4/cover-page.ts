import { readFileSync } from 'node:fs';
import type { PDFDocument, PDFPage } from 'pdf-lib';
import type { BookletFonts, BookletModel, CoverCounts, PageFrame } from './interfaces/booklet.interface.js';
import { drawPolygon, drawSegment, INK, LINE_STYLES, MUTED, POINTS_PER_MM, TAB_FILL, wrapText } from './pdf-drawing.js';
import { fillTemplate } from './sheet-translations.js';
import type { CoverTexts, LegendKind } from './interfaces/sheet-translations.interface.js';

const BODY_MM = 3.6;
const LINE_MM = 5.2;
const IMAGE_MM = 120;
const SAMPLE_MM = 14;

export class CoverPage {
  private cursor: number;
  private readonly page: PDFPage;

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: BookletFonts,
    private readonly frame: PageFrame,
  ) {
    this.page = document.addPage([frame.width * POINTS_PER_MM, frame.height * POINTS_PER_MM]);
    this.cursor = frame.height - frame.margin;
  }

  async render(texts: CoverTexts, model: BookletModel, coverImage: string, counts: CoverCounts): Promise<void> {
    this.text(model.name, 11, this.fonts.bold, INK);
    this.cursor -= 2;
    this.text(texts.subtitle, 4.6, this.fonts.regular, MUTED);
    await this.image(coverImage);
    const values = { dimensions: model.dimensions, pieces: counts.pieces, sheets: counts.sheets };
    texts.info.forEach((line) => this.paragraph(fillTemplate(line, values), this.frame.margin));
    this.heading(texts.legend_title);
    texts.legend.forEach((entry) => this.legend(entry.kind, entry.label));
    this.heading(texts.method_title);
    texts.method.forEach((line, index) => this.numbered(index + 1, line));
  }

  private text(content: string, sizeMm: number, font: BookletFonts['bold'], color: typeof INK): void {
    this.cursor -= sizeMm;
    this.page.drawText(content, { x: this.frame.margin * POINTS_PER_MM, y: this.cursor * POINTS_PER_MM, size: sizeMm * POINTS_PER_MM, font, color });
    this.cursor -= sizeMm * 0.4;
  }

  private async image(path: string): Promise<void> {
    const png = await this.document.embedPng(readFileSync(path));
    const x = (this.frame.width - IMAGE_MM) / 2;
    this.cursor -= IMAGE_MM + 2;
    this.page.drawImage(png, { x: x * POINTS_PER_MM, y: this.cursor * POINTS_PER_MM, width: IMAGE_MM * POINTS_PER_MM, height: IMAGE_MM * POINTS_PER_MM });
    this.cursor -= 4;
  }

  private heading(content: string): void {
    this.cursor -= 3;
    this.text(content, 5, this.fonts.bold, INK);
    this.cursor -= 1;
  }

  private paragraph(content: string, x: number): void {
    const width = (this.frame.width - this.frame.margin - x) * POINTS_PER_MM;
    for (const line of wrapText(this.fonts.regular, content, BODY_MM * POINTS_PER_MM, width)) {
      this.cursor -= LINE_MM * 0.75;
      this.page.drawText(line, { x: x * POINTS_PER_MM, y: this.cursor * POINTS_PER_MM, size: BODY_MM * POINTS_PER_MM, font: this.fonts.regular, color: INK });
      this.cursor -= LINE_MM * 0.25;
    }
  }

  private legend(kind: LegendKind, label: string): void {
    const y = this.cursor - LINE_MM * 0.6;
    const left = this.frame.margin;
    if (kind === 'tab') {
      drawPolygon(this.page, [[left, y - 1.6], [left + 2, y + 1.6], [left + SAMPLE_MM - 2, y + 1.6], [left + SAMPLE_MM, y - 1.6]], TAB_FILL, INK);
    } else {
      drawSegment(this.page, [left, y], [left + SAMPLE_MM, y], LINE_STYLES[kind]);
    }
    this.paragraph(label, left + SAMPLE_MM + 4);
    this.cursor -= 1;
  }

  private numbered(index: number, content: string): void {
    const top = this.cursor - LINE_MM * 0.75;
    this.page.drawText(`${index}.`, { x: this.frame.margin * POINTS_PER_MM, y: top * POINTS_PER_MM, size: BODY_MM * POINTS_PER_MM, font: this.fonts.bold, color: INK });
    this.paragraph(content, this.frame.margin + 6);
    this.cursor -= 0.6;
  }
}
