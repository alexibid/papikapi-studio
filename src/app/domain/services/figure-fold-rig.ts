import * as THREE from 'three';
import {
  CurveMap,
  Hinge,
  PaperFigure,
  PlacedPlate,
  Point2,
  UnfoldedFigure,
} from '../models/paper-figure';
import { unfoldFigure } from './figure-unfolder';

export interface FoldStep {
  readonly stepNumber: number;
  readonly hingeIds: readonly string[];
  readonly title: string;
  readonly description: string;
}

export interface CameraFraming {
  readonly target: THREE.Vector3;
  readonly radius: number;
}

interface HingeRigNode {
  readonly hingeId: string;
  readonly stepOrder: number;
  readonly pivot: THREE.Group;
  readonly rotator: THREE.Group;
  readonly axis: THREE.Vector3;
  readonly targetAngleRad: number;
}

export class FigureFoldRig {
  readonly root = new THREE.Group();
  readonly steps: readonly FoldStep[];

  private readonly hingeNodes: HingeRigNode[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private rootSymmetryPivot?: THREE.Group;
  private rootSymmetryAxis?: THREE.Vector3;
  private rootSymmetryHingeId?: string;

  constructor(readonly figure: PaperFigure) {
    this.root.rotation.x = -Math.PI / 2;

    const unfolded = unfoldFigure(figure);
    this.steps = this.buildSteps(figure);
    this.buildKinematicTree(figure, unfolded);
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  getStepInfo(stepIndex: number): FoldStep | null {
    if (stepIndex <= 0 || stepIndex > this.steps.length) return null;
    return this.steps[stepIndex - 1];
  }

  applyStep(stepIndex: number, transitionProgress = 1.0): void {
    const activeStep = Math.max(0, Math.min(this.steps.length, stepIndex));
    const subProgress = Math.max(0, Math.min(1.0, transitionProgress));

    for (const node of this.hingeNodes) {
      let progress = 0;
      if (node.stepOrder < activeStep) {
        progress = 1.0;
      } else if (node.stepOrder === activeStep) {
        progress = subProgress;
      }

      const currentAngle = node.targetAngleRad * progress;
      node.rotator.setRotationFromAxisAngle(node.axis, currentAngle);

      if (node.hingeId === this.rootSymmetryHingeId && this.rootSymmetryPivot && this.rootSymmetryAxis) {
        this.rootSymmetryPivot.setRotationFromAxisAngle(this.rootSymmetryAxis, -currentAngle / 2);
      }
    }

    if (this.figure.pitchAngle) {
      const overallProgress = this.steps.length > 0
        ? Math.max(0, Math.min(1.0, activeStep / this.steps.length))
        : 0;
      const pitchRad = -(this.figure.pitchAngle * Math.PI / 180) * overallProgress;
      this.root.rotation.y = pitchRad;
    }
  }

  getCameraFraming(stepIndex: number, transitionProgress = 1.0): CameraFraming {
    this.applyStep(stepIndex, transitionProgress);
    this.root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.root);
    const target = new THREE.Vector3();
    const size = new THREE.Vector3();

    if (box.isEmpty()) {
      return { target: new THREE.Vector3(0, 0, 0), radius: 240 };
    }

    box.getCenter(target);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 60);

    return {
      target,
      radius: Math.max(120, maxDim * 1.5),
    };
  }

  dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables.length = 0;

    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
  }

  private buildSteps(figure: PaperFigure): readonly FoldStep[] {
    const stepMap = new Map<number, { title: string; description: string; hingeIds: string[] }>();

    for (const hinge of figure.hinges) {
      const order = hinge.stepOrder ?? 1;
      const existing = stepMap.get(order);
      const title = hinge.label || `Fold ${order}`;
      const description = hinge.description || `Fold along ${hinge.id}`;

      if (existing) {
        existing.hingeIds.push(hinge.id);
      } else {
        stepMap.set(order, { title, description, hingeIds: [hinge.id] });
      }
    }

    const sortedSteps = Array.from(stepMap.entries()).sort(([a], [b]) => a - b);
    return sortedSteps.map(([, data], index) => {
      return {
        stepNumber: index + 1,
        hingeIds: data.hingeIds,
        title: data.title,
        description: data.description,
      };
    });
  }

  private buildKinematicTree(figure: PaperFigure, unfolded: UnfoldedFigure): void {
    const plateMap = new Map<string, PlacedPlate>(
      unfolded.plates.map((plate) => [plate.id, plate])
    );
    const hingeMap = new Map<string, Hinge>(
      figure.hinges.map((hinge) => [hinge.id, hinge])
    );

    const foldMap = new Map<string, { from: Point2; to: Point2 }>(
      unfolded.folds.map((fold) => [fold.id, { from: fold.from, to: fold.to }])
    );

    const childrenOf = new Map<string, Hinge[]>();
    for (const hinge of figure.hinges) {
      const list = childrenOf.get(hinge.parentPlateId) ?? [];
      list.push(hinge);
      childrenOf.set(hinge.parentPlateId, list);
    }

    const rootPlate = plateMap.get(figure.rootPlateId);
    if (!rootPlate) return;

    const rootContainer = new THREE.Group();
    rootContainer.name = `plate-${rootPlate.id}`;

    const rootMesh = this.createPlateMesh(rootPlate);
    rootContainer.add(rootMesh);

    const spineHinge = figure.hinges.find(
      (h) => h.parentPlateId === figure.rootPlateId && h.kind === 'mountain'
    );
    const spineFold = spineHinge ? foldMap.get(spineHinge.id) : undefined;

    let attachedTo = false;
    if (spineHinge && spineFold) {
      this.rootSymmetryHingeId = spineHinge.id;
      const ax = spineFold.from[0];
      const ay = spineFold.from[1];
      const bx = spineFold.to[0];
      const by = spineFold.to[1];
      const dirX = bx - ax;
      const dirY = by - ay;
      const len = Math.hypot(dirX, dirY);
      if (len > 1e-4) {
        this.rootSymmetryAxis = new THREE.Vector3(dirX / len, dirY / len, 0);

        const symmetryAnchor = new THREE.Group();
        symmetryAnchor.name = 'symmetry-anchor';
        symmetryAnchor.position.set(ax, ay, 0);

        this.rootSymmetryPivot = new THREE.Group();
        this.rootSymmetryPivot.name = 'symmetry-pivot';
        symmetryAnchor.add(this.rootSymmetryPivot);

        this.root.add(symmetryAnchor);

        rootContainer.position.set(-ax, -ay, 0);
        this.rootSymmetryPivot.add(rootContainer);
        attachedTo = true;
      }
    }

    if (!attachedTo) {
      this.root.add(rootContainer);
    }

    this.attachChildren(
      rootPlate.id,
      rootContainer,
      childrenOf,
      plateMap,
      hingeMap,
      foldMap
    );
  }

  private attachChildren(
    parentId: string,
    parentContainer: THREE.Group,
    childrenOf: ReadonlyMap<string, Hinge[]>,
    plateMap: ReadonlyMap<string, PlacedPlate>,
    hingeMap: ReadonlyMap<string, Hinge>,
    foldMap: ReadonlyMap<string, { from: Point2; to: Point2 }>
  ): void {
    const childHinges = childrenOf.get(parentId) ?? [];

    for (const hinge of childHinges) {
      const childPlate = plateMap.get(hinge.childPlateId);
      const fold = foldMap.get(hinge.id);
      if (!childPlate || !fold) continue;

      const ax = fold.from[0];
      const ay = fold.from[1];
      const bx = fold.to[0];
      const by = fold.to[1];

      const dirX = bx - ax;
      const dirY = by - ay;
      const len = Math.hypot(dirX, dirY);
      if (len < 1e-4) continue;

      const axis = new THREE.Vector3(dirX / len, dirY / len, 0);

      const centroid = this.calculateCentroid(childPlate.outline);
      const midX = (ax + bx) / 2;
      const midY = (ay + by) / 2;
      const toCenterX = centroid[0] - midX;
      const toCenterY = centroid[1] - midY;

      const crossZ = axis.x * toCenterY - axis.y * toCenterX;

      const angleDeg = hinge.angle ?? (hinge.kind === 'mountain' ? 90 : 90);
      const angleRad = (angleDeg * Math.PI) / 180;

      let targetAngleRad: number;
      if (hinge.kind === 'mountain') {
        targetAngleRad = crossZ < 0 ? angleRad : -angleRad;
      } else {
        targetAngleRad = crossZ < 0 ? -angleRad : angleRad;
      }

      const pivot = new THREE.Group();
      pivot.name = `pivot-${hinge.id}`;
      pivot.position.set(ax, ay, 0);

      const rotator = new THREE.Group();
      rotator.name = `rotator-${hinge.id}`;
      pivot.add(rotator);

      const childContainer = new THREE.Group();
      childContainer.name = `plate-${childPlate.id}`;
      childContainer.position.set(-ax, -ay, 0);

      const childMesh = this.createPlateMesh(childPlate);
      childContainer.add(childMesh);
      rotator.add(childContainer);

      parentContainer.add(pivot);

      this.hingeNodes.push({
        hingeId: hinge.id,
        stepOrder: hinge.stepOrder ?? 1,
        pivot,
        rotator,
        axis,
        targetAngleRad,
      });

      this.attachChildren(
        childPlate.id,
        childContainer,
        childrenOf,
        plateMap,
        hingeMap,
        foldMap
      );
    }
  }

  private calculateCentroid(points: readonly Point2[]): Point2 {
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p[0];
      sumY += p[1];
    }
    const count = Math.max(1, points.length);
    return [sumX / count, sumY / count];
  }

  private createPlateMesh(plate: PlacedPlate): THREE.Group {
    const group = new THREE.Group();

    const shape = this.createShape(plate.outline, plate.curves);
    const geo = new THREE.ShapeGeometry(shape);
    this.disposables.push(geo);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(plate.hue),
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.disposables.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    for (const overlay of plate.overlays) {
      const overlayShape = this.createShape(overlay.outline, overlay.curves);
      const overlayGeo = new THREE.ShapeGeometry(overlayShape);
      this.disposables.push(overlayGeo);

      const overlayMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(overlay.hue),
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.disposables.push(overlayMat);

      const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
      overlayMesh.position.z = 0.04;
      group.add(overlayMesh);
    }

    for (const decor of plate.decor) {
      const decorShape = new THREE.Shape();
      decorShape.absellipse(
        decor.cx,
        decor.cy,
        decor.rx,
        decor.ry,
        0,
        Math.PI * 2,
        false,
        decor.angle
      );

      const decorGeo = new THREE.ShapeGeometry(decorShape);
      this.disposables.push(decorGeo);

      const decorMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(decor.hue),
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.disposables.push(decorMat);

      const decorMesh = new THREE.Mesh(decorGeo, decorMat);
      decorMesh.position.z = 0.08;
      group.add(decorMesh);
    }

    const outlineMat = new THREE.LineBasicMaterial({
      color: 0x1f241d,
      linewidth: 1,
    });
    this.disposables.push(outlineMat);

    const linePoints: THREE.Vector3[] = [];
    for (const edge of plate.cutEdges) {
      if (edge.control) {
        const curve = new THREE.QuadraticBezierCurve(
          new THREE.Vector2(edge.from[0], edge.from[1]),
          new THREE.Vector2(edge.control[0], edge.control[1]),
          new THREE.Vector2(edge.to[0], edge.to[1])
        );
        const pts = curve.getPoints(12);
        for (let i = 0; i < pts.length - 1; i++) {
          linePoints.push(
            new THREE.Vector3(pts[i].x, pts[i].y, 0.1),
            new THREE.Vector3(pts[i + 1].x, pts[i + 1].y, 0.1)
          );
        }
      } else {
        linePoints.push(
          new THREE.Vector3(edge.from[0], edge.from[1], 0.1),
          new THREE.Vector3(edge.to[0], edge.to[1], 0.1)
        );
      }
    }

    if (linePoints.length > 0) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      this.disposables.push(lineGeo);
      const lines = new THREE.LineSegments(lineGeo, outlineMat);
      group.add(lines);
    }

    return group;
  }

  private createShape(outline: readonly Point2[], curves?: CurveMap): THREE.Shape {
    const shape = new THREE.Shape();
    if (!outline || outline.length === 0) return shape;

    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 0; i < outline.length; i++) {
      const p1 = outline[(i + 1) % outline.length];
      const ctrl = curves?.[i];
      if (ctrl) {
        shape.quadraticCurveTo(ctrl[0], ctrl[1], p1[0], p1[1]);
      } else {
        shape.lineTo(p1[0], p1[1]);
      }
    }
    return shape;
  }
}
