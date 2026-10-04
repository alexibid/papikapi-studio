import type { TabPlan, TabShape } from './interfaces/artwork.interface.js';
import type { NetCut, NetPiece, Point } from './interfaces/net.interface.js';
import { add, centroid, leftNormal, length, scale, subtract, unit } from './net-geometry.js';

const SHRINK = 0.96;
const HEIGHT_STEPS = [1, 0.7, 0.45];
const MIN_HEIGHT_MM = 2;

export const cutKey = (piece: number, cut: NetCut): string => `${piece}:${cut.edge}:${cut.face}`;

function outwardNormal(face: readonly Point[], cut: NetCut): Point {
  const direction = unit(subtract(cut.b, cut.a));
  const raw = leftNormal(direction);
  const inward = subtract(centroid(face), cut.a);
  return raw[0] * inward[0] + raw[1] * inward[1] > 0 ? scale(raw, -1) : raw;
}

export function tabShape(face: readonly Point[], cut: NetCut, maxHeight: number): TabShape {
  const direction = unit(subtract(cut.b, cut.a));
  const outward = outwardNormal(face, cut);
  const edgeLength = length(subtract(cut.b, cut.a));
  const height = Math.max(MIN_HEIGHT_MM, Math.min(maxHeight, edgeLength * 0.4));
  const inset = Math.min(height, edgeLength * 0.3);
  const topA = add(add(cut.a, scale(outward, height)), scale(direction, inset));
  const topB = add(subtract(cut.b, scale(direction, inset)), scale(outward, height));
  return { polygon: [cut.a, topA, topB, cut.b], height, outward };
}

function shrunk(polygon: readonly Point[]): Point[] {
  const centre = centroid(polygon);
  return polygon.map((point) => add(centre, scale(subtract(point, centre), SHRINK)));
}

function separated(first: readonly Point[], second: readonly Point[]): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const axis = leftNormal(subtract(polygon[(index + 1) % polygon.length], polygon[index]));
      const project = (shape: readonly Point[]): number[] =>
        shape.map((point) => point[0] * axis[0] + point[1] * axis[1]);
      const [a, b] = [project(first), project(second)];
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return true;
    }
  }
  return false;
}

export class TabPlanner {
  private readonly occupied = new Map<number, Point[][]>();
  private readonly plan = new Map<string, TabShape>();

  constructor(
    private readonly pieces: readonly NetPiece[],
    private readonly maxHeight: number,
  ) {
    pieces.forEach((piece) =>
      this.occupied.set(
        piece.number,
        piece.faces.map((face) => shrunk(face)),
      ),
    );
  }

  build(): TabPlan {
    const occurrences = new Map<number, { piece: NetPiece; cut: NetCut }[]>();
    this.pieces.forEach((piece) =>
      piece.cuts.forEach((cut) =>
        occurrences.set(cut.edge, [...(occurrences.get(cut.edge) ?? []), { piece, cut }]),
      ),
    );
    for (const pair of occurrences.values()) {
      const ordered = [...pair].sort(
        (first, second) => Number(second.cut.tab) - Number(first.cut.tab),
      );
      this.placeBest(ordered);
    }
    return this.plan;
  }

  private placeBest(sides: readonly { piece: NetPiece; cut: NetCut }[]): void {
    for (const factor of HEIGHT_STEPS) {
      for (const side of sides) {
        if (this.tryPlace(side.piece, side.cut, this.maxHeight * factor)) return;
      }
    }
    this.force(sides[0].piece, sides[0].cut);
  }

  private shapeFor(piece: NetPiece, cut: NetCut, height: number): TabShape {
    return tabShape(piece.faces[piece.faceIds.indexOf(cut.face)], cut, height);
  }

  private tryPlace(piece: NetPiece, cut: NetCut, height: number): boolean {
    const shape = this.shapeFor(piece, cut, height);
    const candidate = shrunk(shape.polygon);
    const blockers = this.occupied.get(piece.number) ?? [];
    if (!blockers.every((blocker) => separated(candidate, blocker))) return false;
    this.accept(piece, cut, shape, candidate);
    return true;
  }

  private force(piece: NetPiece, cut: NetCut): void {
    const shape = this.shapeFor(piece, cut, MIN_HEIGHT_MM);
    this.accept(piece, cut, shape, shrunk(shape.polygon));
  }

  private accept(piece: NetPiece, cut: NetCut, shape: TabShape, footprint: Point[]): void {
    this.plan.set(cutKey(piece.number, cut), shape);
    this.occupied.get(piece.number)?.push(footprint);
  }
}
