import type { HalfPlane, Rectangle, Vertex } from './glb.interface.js';

export class PolygonClipper {
  public static clip(polygon: readonly Vertex[], rectangle: Rectangle): Vertex[] {
    return this.halfPlanes(rectangle).reduce<Vertex[]>(
      (remaining, plane) => (remaining.length === 0 ? remaining : this.clipAgainst(remaining, plane)),
      [...polygon],
    );
  }

  private static halfPlanes(rectangle: Rectangle): HalfPlane[] {
    return [
      { axis: 'x', bound: rectangle.minX, keepAbove: true },
      { axis: 'x', bound: rectangle.maxX, keepAbove: false },
      { axis: 'z', bound: rectangle.minZ, keepAbove: true },
      { axis: 'z', bound: rectangle.maxZ, keepAbove: false },
    ];
  }

  private static distance(vertex: Vertex, plane: HalfPlane): number {
    const coordinate = vertex[plane.axis];
    return plane.keepAbove ? coordinate - plane.bound : plane.bound - coordinate;
  }

  private static clipAgainst(polygon: readonly Vertex[], plane: HalfPlane): Vertex[] {
    const clipped: Vertex[] = [];
    polygon.forEach((current, index) => {
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentDistance = this.distance(current, plane);
      const previousDistance = this.distance(previous, plane);
      if (currentDistance >= 0 !== previousDistance >= 0) {
        clipped.push(this.interpolate(previous, current, previousDistance / (previousDistance - currentDistance)));
      }
      if (currentDistance >= 0) clipped.push({ ...current });
    });
    return clipped;
  }

  private static interpolate(from: Vertex, to: Vertex, ratio: number): Vertex {
    const blend = (start: number, end: number): number => start + (end - start) * ratio;
    return {
      x: blend(from.x, to.x),
      y: blend(from.y, to.y),
      z: blend(from.z, to.z),
      u: blend(from.u, to.u),
      v: blend(from.v, to.v),
    };
  }
}
