import type {
  ArtFold,
  ArtLine,
  ArtText,
  ArtworkContext,
  ArtworkSettings,
  PieceArtwork,
  TabPlan,
} from './interfaces/artwork.interface.js';
import type { NetCut, NetPiece, Point } from './interfaces/net.interface.js';
import { countCollisions, labelBox } from './label-collisions.js';
import {
  add,
  boundsOf,
  centroid,
  length,
  polygonArea,
  rotate,
  scale,
  subtract,
  tightestRotation,
  unit,
  uprightAngle,
} from './net-geometry.js';
import { cutKey, tabShape } from './tab-planner.js';

const DIGIT_WIDTH = 0.56;
const DART_TOUCH_MM = 0.5;
const ALONG_EDGE = [0.5, 0.36, 0.64, 0.25, 0.75];
const INSET_STEPS = [0.85, 1.6];

const along = (cut: NetCut, share: number): Point =>
  add(cut.a, scale(subtract(cut.b, cut.a), share));

export function buildArtwork(piece: NetPiece, context: ArtworkContext): PieceArtwork {
  const builder = new ArtworkBuilder(piece, context.settings, context.tabs);
  piece.cuts.forEach((cut) => builder.addCut(cut));
  piece.folds.forEach((fold) => builder.folds.push({ a: fold.a, b: fold.b, kind: fold.kind }));
  builder.addLabel(`${context.labelPrefix}${piece.number}`);
  return builder.normalised(piece.number, context.printable);
}

class ArtworkBuilder {
  readonly faces: Point[][];
  readonly tabs: Point[][] = [];
  readonly cuts: ArtLine[] = [];
  readonly folds: ArtFold[] = [];
  readonly texts: ArtText[] = [];

  constructor(
    private readonly piece: NetPiece,
    private readonly settings: ArtworkSettings,
    private readonly plan: TabPlan,
  ) {
    this.faces = piece.faces.map((face) => [...face]);
  }

  addCut(cut: NetCut): void {
    const direction = unit(subtract(cut.b, cut.a));
    const size = this.numberSize(String(cut.number), length(subtract(cut.b, cut.a)));
    const tab = this.plan.get(cutKey(this.piece.number, cut));
    if (tab) {
      const [, topA, topB] = tab.polygon;
      this.tabs.push([...tab.polygon]);
      this.cuts.push({ a: cut.a, b: topA }, { a: topA, b: topB }, { a: topB, b: cut.b });
      this.folds.push({ a: cut.a, b: cut.b, kind: 'tab' });
      const tabSize = Math.min(size, tab.height * 0.7);
      const spots = ALONG_EDGE.map((share) =>
        add(along(cut, share), scale(tab.outward, tab.height / 2)),
      );
      this.addNumber(String(cut.number), spots, direction, tabSize);
    } else {
      const outward = tabShape(this.faces[this.piece.faceIds.indexOf(cut.face)], cut, 0).outward;
      this.cuts.push({ a: cut.a, b: cut.b });
      if (!this.isDartSide(cut) && cut.number > 0) {
        const spots = INSET_STEPS.flatMap((inset) =>
          ALONG_EDGE.map((share) => subtract(along(cut, share), scale(outward, size * inset))),
        );
        this.addNumber(String(cut.number), spots, direction, size);
      }
    }
  }

  private isDartSide(cut: NetCut): boolean {
    const partner = this.piece.cuts.find(
      (other) => other.edge === cut.edge && other.face !== cut.face,
    );
    if (!partner) return false;
    const ends = [cut.a, cut.b];
    return [partner.a, partner.b].some((end) =>
      ends.some((point) => length(subtract(point, end)) < DART_TOUCH_MM),
    );
  }

  addLabel(text: string): void {
    const largest = this.faces.reduce((best, face) =>
      polygonArea(face) > polygonArea(best) ? face : best,
    );
    this.texts.push({
      text,
      at: centroid(largest),
      angle: 0,
      sizeMm: this.settings.piece_label_mm,
      bold: true,
    });
  }

  normalised(number: number, printable: readonly [number, number]): PieceArtwork {
    const everything = [...this.faces.flat(), ...this.tabs.flat()];
    const angle = tightestRotation(everything, printable);
    const turned = everything.map((point) => rotate(point, angle));
    const box = boundsOf(turned);
    const shift: Point = [-box.minX, -box.minY];
    const move = (point: Point): Point => add(rotate(point, angle), shift);
    const moveLine = <T extends ArtLine>(line: T): T => ({
      ...line,
      a: move(line.a),
      b: move(line.b),
    });
    const turnText = (text: ArtText): ArtText => ({
      ...text,
      at: move(text.at),
      angle: text.bold
        ? 0
        : uprightAngle(rotate([Math.cos(text.angle), Math.sin(text.angle)], angle)),
    });
    return {
      number,
      faceIds: this.piece.faceIds,
      faces: this.faces.map((face) => face.map(move)),
      tabs: this.tabs.map((tab) => tab.map(move)),
      cuts: this.cuts.map(moveLine),
      folds: this.folds.map(moveLine),
      texts: this.texts.map(turnText),
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
    };
  }

  private numberSize(text: string, edgeLength: number): number {
    const fitting = (edgeLength * 0.7) / (text.length * DIGIT_WIDTH);
    return Math.max(
      this.settings.min_edge_number_mm,
      Math.min(this.settings.edge_number_mm, fitting),
    );
  }

  private addNumber(text: string, spots: readonly Point[], direction: Point, sizeMm: number): void {
    const angle = Math.atan2(direction[1], direction[0]);
    const width = text.length * DIGIT_WIDTH * sizeMm;
    const placed = this.texts.map((other) =>
      labelBox(other.at, other.text.length * DIGIT_WIDTH * other.sizeMm, other.sizeMm, other.angle),
    );
    const free = spots.find((spot) =>
      placed.every((box) => countCollisions([box, labelBox(spot, width, sizeMm, angle)]) === 0),
    );
    this.texts.push({
      text,
      at: free ?? spots[0],
      angle,
      sizeMm: free ? sizeMm : this.settings.min_edge_number_mm,
      bold: false,
    });
  }
}
