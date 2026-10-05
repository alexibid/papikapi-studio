import type { FaceGeometry, Pose, Vec3 } from './interfaces/assembly.interface.js';
import { VectorMath } from './vector-math.js';

export class FaceFrame {
  public static flatToSolid(face: FaceGeometry): Pose {
    const flat = face.flat.map(VectorMath.lift);
    const flatX = VectorMath.normalize(VectorMath.subtract(flat[1], flat[0]));
    const flatY = VectorMath.cross([0, 0, 1], flatX);
    const solidX = VectorMath.normalize(VectorMath.subtract(face.solid[1], face.solid[0]));
    const solidNormal = VectorMath.newellNormal(face.solid);
    const solidY = VectorMath.cross(solidNormal, solidX);
    const rotation = VectorMath.multiply(
      VectorMath.fromColumns(solidX, solidY, solidNormal),
      VectorMath.transpose(VectorMath.fromColumns(flatX, flatY, [0, 0, 1])),
    );
    const flatCentre = VectorMath.centroid(flat);
    const solidCentre = VectorMath.centroid(face.solid);
    return {
      rotation,
      translation: VectorMath.subtract(solidCentre, VectorMath.rotate(rotation, flatCentre)),
    };
  }

  public static hingeAngle(parent: Pose, child: Pose, axisDirection: Vec3): number {
    const relative = VectorMath.compose(VectorMath.inverse(parent), child);
    const across = VectorMath.cross([0, 0, 1], axisDirection);
    const turned = VectorMath.rotate(relative.rotation, across);
    return Math.atan2(VectorMath.dot(turned, [0, 0, 1]), VectorMath.dot(turned, across));
  }

  public static hingeResidualMm(parent: Pose, child: Pose, edge: readonly [Vec3, Vec3]): number {
    const relative = VectorMath.compose(VectorMath.inverse(parent), child);
    return Math.max(
      ...edge.map((end) =>
        VectorMath.length(VectorMath.subtract(VectorMath.apply(relative, end), end)),
      ),
    );
  }
}
