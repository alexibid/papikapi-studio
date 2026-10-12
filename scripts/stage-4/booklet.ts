import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, type PDFImage, StandardFonts } from 'pdf-lib';
import type {
  BookletModel,
  BookletSettings,
  BookletSummary,
  PageFrame,
} from './interfaces/booklet.interface.js';
import { CoverPage } from './cover-page.js';
import type { PageBaker, Placement } from './interfaces/layout.interface.js';
import type { NetDocument, RenderSet } from './interfaces/net.interface.js';
import { NetSheets } from './net-sheets.js';
import { PagePacker } from './page-packer.js';
import { buildArtwork } from './piece-artwork.js';
import type { BookletTexts } from './interfaces/sheet-translations.interface.js';
import { StepPages } from './step-pages.js';
import { TabPlanner } from './tab-planner.js';

export class Booklet {
  static async build(
    net: NetDocument,
    renders: RenderSet,
    settings: BookletSettings,
    texts: BookletTexts,
    model: BookletModel,
    outputPath: string,
    bakePages: PageBaker,
  ): Promise<BookletSummary> {
    const frame: PageFrame = {
      width: settings.page_width_mm,
      height: settings.page_height_mm,
      margin: settings.margin_mm,
      header: settings.header_mm,
    };
    const printable: [number, number] = [
      frame.width - 2 * frame.margin,
      frame.height - 2 * frame.margin - frame.header,
    ];
    const tabs = new TabPlanner(net.pieces, settings.tab_height_mm).build();
    const gapCells = Math.ceil(settings.piece_gap_mm / 2 / settings.nesting_cell_mm);
    const baseClearance = 2 * gapCells * settings.nesting_cell_mm;
    const pieceFrame: [number, number] = [
      printable[0] - baseClearance,
      printable[1] - baseClearance - 12,
    ];
    const artworks = net.pieces.map((piece) =>
      buildArtwork(piece, {
        settings,
        labelPrefix: texts.piece_prefix,
        printable: pieceFrame,
        tabs,
      }),
    );
    const figureArtworks = artworks.filter((artwork) => !artwork.isPlinth);
    const plinthArtworks = artworks.filter((artwork) => Boolean(artwork.isPlinth));

    let plinthPlacements: Placement[] = [];
    let plinthSheets = 0;
    if (plinthArtworks.length > 0) {
      const plinthPacker = new PagePacker(
        printable[0],
        printable[1],
        settings.nesting_cell_mm,
        gapCells,
      );
      plinthPlacements = plinthPacker.pack(plinthArtworks);
      plinthSheets = Math.max(...plinthPlacements.map((placement) => placement.page)) + 1;
    }

    const figurePacker = new PagePacker(printable[0], printable[1], settings.nesting_cell_mm, gapCells);
    const rawFigure = figureArtworks.length > 0 ? figurePacker.pack(figureArtworks) : [];
    const figurePlacements = rawFigure.map((placement) => ({
      ...placement,
      page: placement.page + plinthSheets,
    }));

    const placements = [...plinthPlacements, ...figurePlacements];
    const sheets = Math.max(...placements.map((placement) => placement.page)) + 1;

    const document = await PDFDocument.create();
    const fonts = {
      regular: await document.embedFont(StandardFonts.Helvetica),
      bold: await document.embedFont(StandardFonts.HelveticaBold),
    };
    await new CoverPage(document, fonts, frame).render(texts.cover, model, renders.cover, {
      pieces: net.pieces.length,
      sheets,
    });
    await new StepPages(document, fonts, frame, texts).render(
      net.pieces.map((piece, index) => ({
        piece,
        render: renders.steps[index],
        artwork: artworks[index],
        sheet:
          (placements.find((placement) => placement.artwork.number === piece.number)?.page ?? 0) +
          1,
      })),
    );
    const pageImages: (PDFImage | null)[] = [];
    for (let index = 0; index < plinthSheets; index++) {
      pageImages.push(null);
    }
    if (rawFigure.length > 0) {
      const bakedPaths = bakePages(rawFigure, frame);
      for (const bakedPath of bakedPaths) {
        pageImages.push(await document.embedJpg(readFileSync(bakedPath)));
      }
    }
    const labelCollisions = new NetSheets(document, fonts, frame, texts, pageImages).render(
      placements,
      model.name,
    );

    writeFileSync(outputPath, await document.save());
    return { pages: document.getPageCount(), sheets, pieces: net.pieces.length, labelCollisions };
  }
}
