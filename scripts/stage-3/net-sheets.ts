import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import type { BookletFonts, PageFrame } from './interfaces/booklet.interface.js';
import type { Placement } from './interfaces/layout.interface.js';
import type { Point } from './interfaces/net.interface.js';
import { countCollisions, labelBox } from './label-collisions.js';
import {
  drawCentredText,
  drawPolygon,
  drawSegment,
  LINE_STYLES,
  MUTED,
  POINTS_PER_MM,
  TAB_FILL,
} from './pdf-drawing.js';
import { placePoint } from './placement-transform.js';
import type { BookletTexts } from './interfaces/sheet-translations.interface.js';
import { fillTemplate } from './sheet-translations.js';

export class NetSheets {
  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: BookletFonts,
    private readonly frame: PageFrame,
    private readonly texts: BookletTexts,
    private readonly pageImages: readonly PDFImage[],
  ) {}

  render(placements: readonly Placement[], model: string): number {
    const pageCount = Math.max(...placements.map((placement) => placement.page)) + 1;
    let collisions = 0;
    for (let index = 0; index < pageCount; index++) {
      const onPage = placements.filter((placement) => placement.page === index);
      const page = this.document.addPage([
        this.frame.width * POINTS_PER_MM,
        this.frame.height * POINTS_PER_MM,
      ]);
      page.drawImage(this.pageImages[index], {
        x: 0,
        y: 0,
        width: this.frame.width * POINTS_PER_MM,
        height: this.frame.height * POINTS_PER_MM,
      });
      this.header(page, model, onPage, { page: index + 1, total: pageCount });
      const boxes = onPage.flatMap((placement) => this.drawPiece(page, placement));
      collisions += countCollisions(boxes);
    }
    return collisions;
  }

  private header(
    page: PDFPage,
    model: string,
    onPage: readonly Placement[],
    position: { page: number; total: number },
  ): void {
    const top = this.frame.height - this.frame.margin + 2;
    const size = 3.2;
    const title = `${model} · ${this.texts.sheet_heading}`;
    const pieces = fillTemplate(this.texts.sheet_pieces, {
      pieces: [...onPage]
        .sort((first, second) => first.artwork.number - second.artwork.number)
        .map((placement) => `${this.texts.piece_prefix}${placement.artwork.number}`)
        .join(', '),
    });
    page.drawText(title, {
      x: this.frame.margin * POINTS_PER_MM,
      y: top * POINTS_PER_MM,
      size: size * POINTS_PER_MM,
      font: this.fonts.bold,
      color: MUTED,
    });
    page.drawText(pieces, {
      x: this.frame.margin * POINTS_PER_MM,
      y: (top - 4.5) * POINTS_PER_MM,
      size: 2.8 * POINTS_PER_MM,
      font: this.fonts.regular,
      color: MUTED,
    });
    const label = fillTemplate(this.texts.page_label, position);
    const width = this.fonts.regular.widthOfTextAtSize(label, size * POINTS_PER_MM);
    page.drawText(label, {
      x: (this.frame.width - this.frame.margin) * POINTS_PER_MM - width,
      y: top * POINTS_PER_MM,
      size: size * POINTS_PER_MM,
      font: this.fonts.regular,
      color: MUTED,
    });
  }

  private drawPiece(page: PDFPage, placement: Placement): Point[][] {
    const place = (point: Point): Point => placePoint(point, placement, this.frame.margin);
    const turn = (placement.turns * Math.PI) / 2;
    const art = placement.artwork;
    art.tabs.forEach((tab) => drawPolygon(page, tab.map(place), TAB_FILL));
    art.folds.forEach((fold) =>
      drawSegment(page, place(fold.a), place(fold.b), LINE_STYLES[fold.kind]),
    );
    art.cuts.forEach((cut) => drawSegment(page, place(cut.a), place(cut.b), LINE_STYLES.cut));
    return art.texts.map((text) => {
      const font = text.bold ? this.fonts.bold : this.fonts.regular;
      const angle = text.bold ? 0 : uprightTurn(text.angle + turn);
      drawCentredText(page, font, text.text, place(text.at), text.sizeMm, angle);
      const width = font.widthOfTextAtSize(text.text, text.sizeMm * POINTS_PER_MM) / POINTS_PER_MM;
      return labelBox(place(text.at), width, text.sizeMm, angle);
    });
  }
}

function uprightTurn(angle: number): number {
  const normalised = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (normalised > Math.PI / 2) return normalised - Math.PI;
  if (normalised < -Math.PI / 2) return normalised + Math.PI;
  return normalised;
}
