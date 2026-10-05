import { Box3, DoubleSide, Group, MeshLambertMaterial, Sphere, Vector3 } from 'three';
import { AssemblyPlan } from '../../../domain/assembly/assembly-plan';
import { entryBlend, exitBlend, stepPosition } from '../../../domain/assembly/assembly-timeline';
import { PieceRig } from './piece-rig';

const MM_TO_SCENE = 0.001;
const MIN_SHOT_SHARE = 0.22;
const FINALE_SHARE = 0.8;

export class AssemblyRig {
  readonly root = new Group();

  private readonly material = new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
    flatShading: true,
  });
  private readonly pieces: readonly PieceRig[];
  private overview = new Sphere();
  private placed: readonly Sphere[] = [];

  constructor(plan: AssemblyPlan) {
    this.pieces = plan.pieces.map((piece) => new PieceRig(piece, this.material));
    const stage = new Group();
    stage.rotation.x = -Math.PI / 2;
    stage.scale.setScalar(MM_TO_SCENE);
    this.pieces.forEach((piece) => stage.add(piece.group));
    this.root.add(stage);
  }

  update(progress: number): void {
    this.pieces.forEach((piece) => piece.update(progress));
  }

  get stepCount(): number {
    return this.pieces.length;
  }

  extent(): Box3 {
    this.update(0);
    const waiting = new Box3().setFromObject(this.root);
    this.update(1);
    this.placed = this.pieces.map((piece) => piece.bounds());
    const [first, ...rest] = this.placed;
    this.overview = rest.reduce((union, sphere) => union.union(sphere), first.clone());
    const figure = new Box3().setFromCenterAndSize(
      this.overview.center,
      new Vector3().setScalar(this.overview.radius * 2),
    );
    return waiting.union(figure);
  }

  shot(progress: number): Sphere {
    const { index, local } = stepPosition(progress, this.pieces.length);
    const current = this.closeUp(this.pieces[index].bounds());
    const before = index === 0 ? this.overview : this.closeUp(this.placed[index - 1]);
    const entering = this.blend(before, current, entryBlend(local));
    if (index < this.pieces.length - 1) {
      return entering;
    }
    return this.blend(entering, this.finale(), exitBlend(local));
  }

  finaleWeight(progress: number): number {
    const { index, local } = stepPosition(progress, this.pieces.length);
    return index === this.pieces.length - 1 ? exitBlend(local) : 0;
  }

  private finale(): Sphere {
    return new Sphere(this.overview.center.clone(), this.overview.radius * FINALE_SHARE);
  }

  private closeUp(bounds: Sphere): Sphere {
    const radius = Math.max(bounds.radius, this.overview.radius * MIN_SHOT_SHARE);
    return new Sphere(bounds.center.clone(), radius);
  }

  private blend(from: Sphere, to: Sphere, weight: number): Sphere {
    return new Sphere(
      from.center.clone().lerp(to.center, weight),
      from.radius + (to.radius - from.radius) * weight,
    );
  }

  dispose(): void {
    this.pieces.forEach((piece) => piece.dispose());
    this.material.dispose();
  }
}
