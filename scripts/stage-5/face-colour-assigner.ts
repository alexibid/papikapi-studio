import type { ColouredTriangle, FaceGeometry, Vec3 } from './interfaces/assembly.interface.js';
import { TriangleDistance } from './triangle-distance.js';
import { VectorMath } from './vector-math.js';

export class FaceColourAssigner {
  public static assign(
    faces: readonly FaceGeometry[],
    triangles: readonly ColouredTriangle[],
  ): ReadonlyMap<number, string> {
    const aligned = this.align(triangles, faces);
    const fans = faces.map((face) => this.fan(face.solid));
    const sums = new Map<number, [number, number, number, number]>();

    for (const triangle of aligned) {
      const centre = VectorMath.centroid(triangle.corners);
      const owner = this.nearestFace(centre, fans);
      const sum = sums.get(owner) ?? [0, 0, 0, 0];
      sums.set(owner, [
        sum[0] + triangle.colour[0],
        sum[1] + triangle.colour[1],
        sum[2] + triangle.colour[2],
        sum[3] + 1,
      ]);
    }

    return new Map(
      faces.map((face, index) => [face.id, this.hex(sums.get(index), face, aligned)] as const),
    );
  }

  private static hex(
    sum: readonly [number, number, number, number] | undefined,
    face: FaceGeometry,
    triangles: readonly ColouredTriangle[],
  ): string {
    if (sum === undefined) return this.hexOf(this.nearestTriangle(face, triangles).colour);
    return this.hexOf([sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]]);
  }

  private static hexOf(colour: readonly number[]): string {
    return `#${colour.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  }

  private static nearestTriangle(
    face: FaceGeometry,
    triangles: readonly ColouredTriangle[],
  ): ColouredTriangle {
    const centre = VectorMath.centroid(face.solid);
    const distances = triangles.map((t) =>
      VectorMath.length(VectorMath.subtract(VectorMath.centroid(t.corners), centre)),
    );
    return triangles[distances.indexOf(Math.min(...distances))];
  }

  private static nearestFace(
    point: Vec3,
    fans: readonly (readonly (readonly [Vec3, Vec3, Vec3])[])[],
  ): number {
    let best = 0;
    let bestDistance = Infinity;
    fans.forEach((fan, index) => {
      for (const corners of fan) {
        const distance = TriangleDistance.squared(point, corners);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
    });
    return best;
  }

  private static fan(polygon: readonly Vec3[]): readonly (readonly [Vec3, Vec3, Vec3])[] {
    return polygon
      .slice(2)
      .map((corner, index) => [polygon[0], polygon[index + 1], corner] as const);
  }

  private static align(
    triangles: readonly ColouredTriangle[],
    faces: readonly FaceGeometry[],
  ): readonly ColouredTriangle[] {
    const source = this.bounds(triangles.flatMap((t) => t.corners));
    const target = this.bounds(faces.flatMap((f) => f.solid));
    const shift: Vec3 = [
      (target.min[0] + target.max[0] - source.min[0] - source.max[0]) / 2,
      (target.min[1] + target.max[1] - source.min[1] - source.max[1]) / 2,
      target.min[2] - source.min[2],
    ];
    return triangles.map((t) => ({
      colour: t.colour,
      corners: t.corners.map((corner) => VectorMath.add(corner, shift)) as unknown as readonly [
        Vec3,
        Vec3,
        Vec3,
      ],
    }));
  }

  private static bounds(points: readonly Vec3[]): { min: Vec3; max: Vec3 } {
    const axis = (i: 0 | 1 | 2) => points.map((p) => p[i]);
    return {
      min: [Math.min(...axis(0)), Math.min(...axis(1)), Math.min(...axis(2))],
      max: [Math.max(...axis(0)), Math.max(...axis(1)), Math.max(...axis(2))],
    };
  }
}
