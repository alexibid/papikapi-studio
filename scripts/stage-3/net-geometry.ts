import type { Bounds } from './interfaces/layout.interface.js';
import type { Point } from './interfaces/net.interface.js';

const SAMPLED_ROTATIONS = 90;

export const add = (first: Point, second: Point): Point => [
  first[0] + second[0],
  first[1] + second[1],
];
export const subtract = (first: Point, second: Point): Point => [
  first[0] - second[0],
  first[1] - second[1],
];
export const scale = (point: Point, factor: number): Point => [
  point[0] * factor,
  point[1] * factor,
];
export const length = (vector: Point): number => Math.hypot(vector[0], vector[1]);
export const unit = (vector: Point): Point => scale(vector, 1 / length(vector));
export const leftNormal = (vector: Point): Point => [-vector[1], vector[0]];
export const midpoint = (first: Point, second: Point): Point => scale(add(first, second), 0.5);

export function rotate(point: Point, angle: number): Point {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine];
}

export function centroid(points: readonly Point[]): Point {
  return scale(
    points.reduce((sum, point) => add(sum, point), [0, 0] as Point),
    1 / points.length,
  );
}

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );
}

export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const cross = (origin: Point, first: Point, second: Point): number =>
    (first[0] - origin[0]) * (second[1] - origin[1]) -
    (first[1] - origin[1]) * (second[0] - origin[0]);
  const chain = (input: readonly Point[]): Point[] => {
    const result: Point[] = [];
    for (const point of input) {
      while (
        result.length >= 2 &&
        cross(result[result.length - 2], result[result.length - 1], point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

export function boundsOf(points: readonly Point[]): Bounds {
  return {
    minX: Math.min(...points.map((point) => point[0])),
    minY: Math.min(...points.map((point) => point[1])),
    maxX: Math.max(...points.map((point) => point[0])),
    maxY: Math.max(...points.map((point) => point[1])),
  };
}

export function tightestRotation(
  points: readonly Point[],
  frame: readonly [number, number],
): number {
  const hull = convexHull(points);
  const [shortSide, longSide] = [...frame].sort((first, second) => first - second);
  const edgeAngles = hull.map((point, index) => {
    const edge = subtract(hull[(index + 1) % hull.length], point);
    return -Math.atan2(edge[1], edge[0]);
  });
  const sampledAngles = Array.from(
    { length: SAMPLED_ROTATIONS },
    (_, index) => (index * Math.PI) / SAMPLED_ROTATIONS,
  );
  const candidates = [...edgeAngles, ...sampledAngles].map((angle) => {
    const box = boundsOf(hull.map((corner) => rotate(corner, angle)));
    const sides = [box.maxX - box.minX, box.maxY - box.minY].sort(
      (first, second) => first - second,
    );
    return {
      angle,
      area: sides[0] * sides[1],
      fits: sides[0] <= shortSide && sides[1] <= longSide,
      longest: sides[1],
    };
  });
  const fitting = candidates.filter((candidate) => candidate.fits);
  const pool = fitting.length > 0 ? fitting : candidates;
  const rank =
    fitting.length > 0
      ? (candidate: (typeof pool)[number]) => candidate.area
      : (candidate: (typeof pool)[number]) => candidate.longest;
  return pool.reduce((best, candidate) => (rank(candidate) < rank(best) ? candidate : best)).angle;
}

export function uprightAngle(direction: Point): number {
  const angle = Math.atan2(direction[1], direction[0]);
  if (angle > Math.PI / 2) return angle - Math.PI;
  if (angle < -Math.PI / 2) return angle + Math.PI;
  return angle;
}
