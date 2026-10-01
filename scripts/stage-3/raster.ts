import type { Point } from './interfaces/net.interface.js';

export class Bitmap {
  private readonly cells: Uint8Array;

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    this.cells = new Uint8Array(columns * rows);
  }

  get(column: number, row: number): boolean {
    return this.cells[row * this.columns + column] === 1;
  }

  set(column: number, row: number): void {
    if (column >= 0 && row >= 0 && column < this.columns && row < this.rows)
      this.cells[row * this.columns + column] = 1;
  }

  occupied(): Point[] {
    const points: Point[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        if (this.get(column, row)) points.push([column, row]);
      }
    }
    return points;
  }

  collides(shape: Bitmap, column: number, row: number): boolean {
    for (const [x, y] of shape.filled) {
      if (this.cells[(row + y) * this.columns + column + x] === 1) return true;
    }
    return false;
  }

  stamp(shape: Bitmap, column: number, row: number): void {
    for (const [x, y] of shape.filled) this.set(column + x, row + y);
  }

  private cache: Point[] | undefined;

  get filled(): Point[] {
    this.cache ??= this.occupied();
    return this.cache;
  }
}

function inside(point: Point, polygon: readonly Point[]): boolean {
  let crossings = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      crossings = !crossings;
  }
  return crossings;
}

export function rasterise(
  polygons: readonly (readonly Point[])[],
  cell: number,
  margin: number,
): Bitmap {
  const all = polygons.flat();
  const width = Math.max(...all.map((point) => point[0]));
  const height = Math.max(...all.map((point) => point[1]));
  const bitmap = new Bitmap(
    Math.ceil(width / cell) + 2 * margin,
    Math.ceil(height / cell) + 2 * margin,
  );
  const samples = [0.15, 0.5, 0.85];
  for (let row = 0; row < bitmap.rows - 2 * margin; row++) {
    for (let column = 0; column < bitmap.columns - 2 * margin; column++) {
      const hit = samples.some((dy) =>
        samples.some((dx) =>
          polygons.some((polygon) => inside([(column + dx) * cell, (row + dy) * cell], polygon)),
        ),
      );
      if (!hit) continue;
      for (let y = -margin; y <= margin; y++) {
        for (let x = -margin; x <= margin; x++) bitmap.set(column + margin + x, row + margin + y);
      }
    }
  }
  return bitmap;
}
