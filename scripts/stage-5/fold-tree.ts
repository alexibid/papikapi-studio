import { FaceFrame } from './face-frame.js';
import type {
  AssemblyFace,
  FaceGeometry,
  FoldedPiece,
  Vec2,
} from './interfaces/assembly.interface.js';
import { VectorMath } from './vector-math.js';

interface SharedEdge {
  readonly neighbour: number;
  readonly a: Vec2;
  readonly b: Vec2;
}

export class FoldTree {
  public static build(faces: readonly FaceGeometry[], toleranceMm: number): FoldedPiece {
    const poses = faces.map((face) => FaceFrame.flatToSolid(face));
    const order: number[] = [];
    const parentOf = new Map<number, number>();
    const edgeOf = new Map<number, SharedEdge>();
    const depthOf = new Map<number, number>();
    let roots = 0;

    while (order.length < faces.length) {
      const root = this.largestUnreached(faces, depthOf);
      depthOf.set(root, 0);
      order.push(root);
      roots++;
      for (let cursor = order.length - 1; cursor < order.length; cursor++) {
        const current = order[cursor];
        for (const shared of this.sharedEdges(faces, current, toleranceMm)) {
          if (depthOf.has(shared.neighbour)) continue;
          parentOf.set(shared.neighbour, current);
          edgeOf.set(shared.neighbour, shared);
          depthOf.set(shared.neighbour, (depthOf.get(current) ?? 0) + 1);
          order.push(shared.neighbour);
        }
      }
    }

    const indexOf = new Map(order.map((faceIndex, position) => [faceIndex, position]));
    let residualMm = 0;
    let maxAngleRad = 0;
    const folded = order.map((faceIndex): Omit<AssemblyFace, 'colour'> => {
      const parent = parentOf.get(faceIndex);
      const edge = edgeOf.get(faceIndex);
      const base = {
        id: faces[faceIndex].id,
        depth: depthOf.get(faceIndex) ?? 0,
        polygon: faces[faceIndex].flat,
        solid: faces[faceIndex].solid,
      };
      if (parent === undefined || edge === undefined) {
        return { ...base, parent: -1, pose: VectorMath.placed(poses[faceIndex]) };
      }
      const ends = [VectorMath.lift(edge.a), VectorMath.lift(edge.b)] as const;
      const angleRad = FaceFrame.hingeAngle(
        poses[parent],
        poses[faceIndex],
        VectorMath.normalize(VectorMath.subtract(ends[1], ends[0])),
      );
      residualMm = Math.max(
        residualMm,
        FaceFrame.hingeResidualMm(poses[parent], poses[faceIndex], ends),
      );
      maxAngleRad = Math.max(maxAngleRad, Math.abs(angleRad));
      return {
        ...base,
        parent: indexOf.get(parent) ?? -1,
        hinge: { a: edge.a, b: edge.b, angleRad },
      };
    });

    return {
      faces: folded,
      residualMm,
      maxAngleRad,
      mirrored: faces.some((face) => VectorMath.signedArea(face.flat) < 0),
      extraRoots: roots - 1,
    };
  }

  private static largestUnreached(
    faces: readonly FaceGeometry[],
    reached: ReadonlyMap<number, number>,
  ): number {
    let best = -1;
    let bestArea = -1;
    faces.forEach((face, index) => {
      const area = Math.abs(VectorMath.signedArea(face.flat));
      if (!reached.has(index) && area > bestArea) {
        best = index;
        bestArea = area;
      }
    });
    return best;
  }

  private static sharedEdges(
    faces: readonly FaceGeometry[],
    current: number,
    toleranceMm: number,
  ): readonly SharedEdge[] {
    const edges: SharedEdge[] = [];
    faces.forEach((other, neighbour) => {
      if (neighbour === current) return;
      const shared = faces[current].vertexIds.filter((id) => other.vertexIds.includes(id));
      if (shared.length !== 2) return;
      const [a, b] = shared.map((id) => ({
        here: faces[current].flat[faces[current].vertexIds.indexOf(id)],
        there: other.flat[other.vertexIds.indexOf(id)],
      }));
      if (this.distance(a.here, a.there) > toleranceMm) return;
      if (this.distance(b.here, b.there) > toleranceMm) return;
      edges.push({ neighbour, a: a.here, b: b.here });
    });
    return edges;
  }

  private static distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
}
