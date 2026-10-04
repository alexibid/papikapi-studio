import type { Point } from './interfaces/net.interface.js';
import { add, leftNormal, scale, subtract } from './net-geometry.js';

const CAP_HEIGHT = 0.72;

export function labelBox(at: Point, widthMm: number, sizeMm: number, angle: number): Point[] {
  const along: Point = [Math.cos(angle), Math.sin(angle)];
  const across = leftNormal(along);
  const halfWidth = scale(along, widthMm / 2);
  const halfHeight = scale(across, (sizeMm * CAP_HEIGHT) / 2);
  return [
    subtract(subtract(at, halfWidth), halfHeight),
    subtract(add(at, halfWidth), halfHeight),
    add(add(at, halfWidth), halfHeight),
    add(subtract(at, halfWidth), halfHeight),
  ];
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

export function countCollisions(boxes: readonly (readonly Point[])[]): number {
  let collisions = 0;
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) {
      if (!separated(boxes[first], boxes[second])) collisions++;
    }
  }
  return collisions;
}
