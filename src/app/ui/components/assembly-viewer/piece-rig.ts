import { Box3, Group, LineSegments, Material, Matrix4, Mesh, Object3D, Quaternion, Sphere, Vector3 } from 'three';
import {
  AssemblyFace,
  AssemblyPiece,
  FoldHinge,
  PlacedPose,
} from '../../../domain/assembly/assembly-plan';
import { faceFold, pieceMotion } from '../../../domain/assembly/assembly-timeline';
import { FigureBounds, flatGeometry, pieceWireframeGeometry, solidGeometry } from './face-geometry';

const LIFT_MM = 110;
const ARC_MM = 70;

interface FaceNode {
  readonly face: AssemblyFace;
  readonly node: Object3D;
}

export interface PieceMaterials {
  readonly solid: Material;
  readonly wireframe: Material;
}

export class PieceRig {
  readonly group = new Group();

  private readonly folding = new Group();
  private readonly finished = new Group();
  private readonly wireframe = new Group();
  private readonly nodes: readonly FaceNode[];
  private readonly maxDepth: number;

  constructor(
    private readonly piece: AssemblyPiece,
    materials: PieceMaterials,
    bounds: FigureBounds,
  ) {
    this.nodes = piece.faces.map((face) => ({ face, node: new Object3D() }));
    this.maxDepth = Math.max(...piece.faces.map((face) => face.depth));
    this.nodes.forEach(({ face, node }) => {
      node.matrixAutoUpdate = false;
      node.add(new Mesh(flatGeometry(face), materials.solid));
      (face.parent < 0 ? this.folding : this.nodes[face.parent].node).add(node);
      const solid = solidGeometry(face);
      this.finished.add(new Mesh(solid, materials.solid));
    });
    this.wireframe.add(
      new LineSegments(pieceWireframeGeometry(piece.faces, bounds), materials.wireframe),
    );
    this.group.add(this.folding, this.finished, this.wireframe);
  }

  update(progress: number): void {
    const motion = pieceMotion(this.piece, progress);
    this.finished.visible = motion.arrived;
    this.folding.visible = !motion.arrived;
    this.wireframe.visible = !motion.arrived;
    if (motion.arrived) {
      return;
    }
    this.nodes.forEach(({ face, node }) => {
      node.matrix.copy(this.localMatrix(face, motion.fold, motion.travel));
      node.matrixWorldNeedsUpdate = true;
    });
  }

  bounds(): Sphere {
    this.group.updateWorldMatrix(true, true);
    const visible = this.finished.visible ? this.finished : this.folding;
    return new Box3().setFromObject(visible).getBoundingSphere(new Sphere());
  }

  private localMatrix(face: AssemblyFace, fold: number, travel: number): Matrix4 {
    if (face.hinge !== undefined) {
      return this.hingeMatrix(face.hinge, face.depth, fold);
    }
    if (face.pose !== undefined) {
      return this.placement(face.pose, fold, travel);
    }
    throw new Error(`Face ${face.id} has neither a hinge nor a pose`);
  }

  private hingeMatrix(hinge: FoldHinge, depth: number, fold: number): Matrix4 {
    const { a, b, angleRad } = hinge;
    const axis = new Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
    const angle = angleRad * faceFold(fold, depth, this.maxDepth);
    return new Matrix4()
      .makeTranslation(a[0], a[1], 0)
      .multiply(new Matrix4().makeRotationAxis(axis, angle))
      .multiply(new Matrix4().makeTranslation(-a[0], -a[1], 0));
  }

  private placement(pose: PlacedPose, fold: number, travel: number): Matrix4 {
    const start = new Vector3(this.piece.tray[0], this.piece.tray[1], LIFT_MM * fold);
    const position = start.lerp(new Vector3(...pose.position), travel);
    position.z += ARC_MM * Math.sin(Math.PI * travel);
    const rotation = new Quaternion().slerp(new Quaternion(...pose.quaternion), travel);
    return new Matrix4().compose(position, rotation, new Vector3(1, 1, 1));
  }

  dispose(): void {
    this.group.traverse((node) => {
      if (node instanceof Mesh || node instanceof LineSegments) {
        node.geometry.dispose();
      }
    });
  }
}
