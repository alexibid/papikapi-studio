import type { PieceArtwork } from './interfaces/artwork.interface.js';
import type { Placement, QuarterTurns } from './interfaces/layout.interface.js';
import type { Point } from './interfaces/net.interface.js';
import { Bitmap, rasterise } from './raster.js';

const TURNS: readonly QuarterTurns[] = [0, 1, 2, 3];

export function turnPoint(point: Point, turns: QuarterTurns, width: number, height: number): Point {
  switch (turns) {
    case 1:
      return [height - point[1], point[0]];
    case 2:
      return [width - point[0], height - point[1]];
    case 3:
      return [point[1], width - point[0]];
    default:
      return point;
  }
}

const ORDERINGS: readonly ((artwork: PieceArtwork) => number)[] = [
  (artwork) => artwork.width * artwork.height,
  (artwork) => Math.max(artwork.width, artwork.height),
  (artwork) => artwork.height,
  (artwork) => artwork.width,
];

export class PagePacker {
  private pages: Bitmap[] = [];
  private readonly columns: number;
  private readonly rows: number;

  constructor(
    width: number,
    height: number,
    private readonly cell: number,
    private readonly gapCells: number,
  ) {
    this.columns = Math.floor(width / cell);
    this.rows = Math.floor(height / cell);
  }

  pack(artworks: readonly PieceArtwork[]): Placement[] {
    const attempts = ORDERINGS.map((measure) =>
      this.attempt([...artworks].sort((first, second) => measure(second) - measure(first))),
    );
    return attempts.reduce((best, attempt) =>
      this.pageCount(attempt) < this.pageCount(best) ? attempt : best,
    );
  }

  private attempt(ordered: readonly PieceArtwork[]): Placement[] {
    this.pages = [];
    return ordered.map((artwork) => this.place(artwork));
  }

  private pageCount(placements: readonly Placement[]): number {
    return Math.max(...placements.map((placement) => placement.page)) + 1;
  }

  private shapes(artwork: PieceArtwork): { turns: QuarterTurns; bitmap: Bitmap }[] {
    return TURNS.map((turns) => {
      const polygons = [...artwork.faces, ...artwork.tabs].map((polygon) =>
        polygon.map((point) => turnPoint(point, turns, artwork.width, artwork.height)),
      );
      return { turns, bitmap: rasterise(polygons, this.cell, this.gapCells) };
    }).filter((shape) => shape.bitmap.columns <= this.columns && shape.bitmap.rows <= this.rows);
  }

  private place(artwork: PieceArtwork): Placement {
    const shapes = this.shapes(artwork);
    if (shapes.length === 0) {
      throw new Error(
        `Piece ${artwork.number} (${artwork.width.toFixed(0)} x ${artwork.height.toFixed(0)} mm) does not fit an A4 page`,
      );
    }
    for (let page = 0; page <= this.pages.length; page++) {
      if (page === this.pages.length) this.pages.push(new Bitmap(this.columns, this.rows));
      const spot = this.firstFit(this.pages[page], shapes);
      if (spot) {
        this.pages[page].stamp(spot.bitmap, spot.column, spot.row);
        const offset = this.gapCells * this.cell;
        return {
          artwork,
          page,
          x: spot.column * this.cell + offset,
          y: spot.row * this.cell + offset,
          turns: spot.turns,
        };
      }
    }
    throw new Error(`Piece ${artwork.number} could not be placed`);
  }

  private firstFit(page: Bitmap, shapes: readonly { turns: QuarterTurns; bitmap: Bitmap }[]) {
    let best:
      | { turns: QuarterTurns; bitmap: Bitmap; column: number; row: number; score: number }
      | undefined;
    for (const shape of shapes) {
      for (let row = 0; row + shape.bitmap.rows <= this.rows; row++) {
        if (best && row * this.columns > best.score) break;
        for (let column = 0; column + shape.bitmap.columns <= this.columns; column++) {
          if (page.collides(shape.bitmap, column, row)) continue;
          const score = row * this.columns + column;
          if (!best || score < best.score) best = { ...shape, column, row, score };
          break;
        }
      }
    }
    return best;
  }
}
