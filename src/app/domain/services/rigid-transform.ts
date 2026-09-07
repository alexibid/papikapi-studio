import { CurveMap, Point2 } from '../models/paper-figure';

export interface Rigid {
  readonly cos: number;
  readonly sin: number;
  readonly tx: number;
  readonly ty: number;
}

export const IDENTITY: Rigid = { cos: 1, sin: 0, tx: 0, ty: 0 };

export function rigidMapping(from: Point2, to: Point2, targetFrom: Point2, targetTo: Point2): Rigid {
  const source: Point2 = [to[0] - from[0], to[1] - from[1]];
  const target: Point2 = [targetTo[0] - targetFrom[0], targetTo[1] - targetFrom[1]];
  const sourceLength = Math.hypot(source[0], source[1]) || 1;
  const targetLength = Math.hypot(target[0], target[1]) || 1;

  const cos = (source[0] * target[0] + source[1] * target[1]) / (sourceLength * targetLength);
  const sin = (source[0] * target[1] - source[1] * target[0]) / (sourceLength * targetLength);

  return {
    cos,
    sin,
    tx: targetFrom[0] - (cos * from[0] - sin * from[1]),
    ty: targetFrom[1] - (sin * from[0] + cos * from[1]),
  };
}

export function apply(transform: Rigid, point: Point2): Point2 {
  return [
    transform.cos * point[0] - transform.sin * point[1] + transform.tx,
    transform.sin * point[0] + transform.cos * point[1] + transform.ty,
  ];
}

export function applyToCurves(transform: Rigid, curves: CurveMap | undefined): CurveMap {
  const moved: Record<number, Point2> = {};
  for (const [edge, control] of Object.entries(curves ?? {})) {
    moved[Number(edge)] = apply(transform, control);
  }
  return moved;
}

export function angleOf(transform: Rigid): number {
  return Math.atan2(transform.sin, transform.cos);
}

export function translate(point: Point2, offset: Point2): Point2 {
  return [point[0] + offset[0], point[1] + offset[1]];
}

export function translateCurves(curves: CurveMap, offset: Point2): CurveMap {
  const moved: Record<number, Point2> = {};
  for (const [edge, control] of Object.entries(curves)) {
    moved[Number(edge)] = translate(control, offset);
  }
  return moved;
}

export function distance(from: Point2, to: Point2): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
}
