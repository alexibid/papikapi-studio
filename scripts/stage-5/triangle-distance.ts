import type { Vec3 } from './interfaces/assembly.interface.js';
import { VectorMath } from './vector-math.js';

export class TriangleDistance {
  public static squared(point: Vec3, corners: readonly [Vec3, Vec3, Vec3]): number {
    const [a, b, c] = corners;
    const closest = this.closestPoint(point, a, b, c);
    const offset = VectorMath.subtract(point, closest);
    return VectorMath.dot(offset, offset);
  }

  private static closestPoint(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
    const ab = VectorMath.subtract(b, a);
    const ac = VectorMath.subtract(c, a);
    const ap = VectorMath.subtract(p, a);
    const d1 = VectorMath.dot(ab, ap);
    const d2 = VectorMath.dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;

    const bp = VectorMath.subtract(p, b);
    const d3 = VectorMath.dot(ab, bp);
    const d4 = VectorMath.dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0)
      return VectorMath.add(a, VectorMath.scale(ab, d1 / (d1 - d3)));

    const cp = VectorMath.subtract(p, c);
    const d5 = VectorMath.dot(ab, cp);
    const d6 = VectorMath.dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0)
      return VectorMath.add(a, VectorMath.scale(ac, d2 / (d2 - d6)));

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const bc = VectorMath.subtract(c, b);
      return VectorMath.add(b, VectorMath.scale(bc, (d4 - d3) / (d4 - d3 + (d5 - d6))));
    }

    const denominator = 1 / (va + vb + vc);
    return VectorMath.add(
      a,
      VectorMath.add(
        VectorMath.scale(ab, vb * denominator),
        VectorMath.scale(ac, vc * denominator),
      ),
    );
  }
}
