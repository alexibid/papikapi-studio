import type { Placement } from './interfaces/layout.interface.js';
import type { Point } from './interfaces/net.interface.js';
import { add } from './net-geometry.js';
import { turnPoint } from './page-packer.js';

export function placePoint(point: Point, placement: Placement, margin: number): Point {
  const origin: Point = [margin + placement.x, margin + placement.y];
  const { width, height } = placement.artwork;
  return add(origin, turnPoint(point, placement.turns, width, height));
}
