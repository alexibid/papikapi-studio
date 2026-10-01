export type Point = readonly [number, number];
export type FoldKind = 'mountain' | 'valley';

export interface NetCut {
  readonly edge: number;
  readonly face: number;
  readonly a: Point;
  readonly b: Point;
  readonly number: number;
  readonly tab: boolean;
}

export interface NetFold {
  readonly a: Point;
  readonly b: Point;
  readonly kind: FoldKind;
}

export interface NetJoin {
  readonly piece: number;
  readonly edges: readonly number[];
}

export interface NetPiece {
  readonly number: number;
  readonly faceIds: readonly number[];
  readonly faces: readonly (readonly Point[])[];
  readonly cuts: readonly NetCut[];
  readonly folds: readonly NetFold[];
  readonly joins: readonly NetJoin[];
  readonly areaMm2: number;
}

export interface NetDocument {
  readonly dimensionsMm: readonly number[];
  readonly pieces: readonly NetPiece[];
}

export interface GlueMark {
  readonly number: number;
  readonly a: Point;
  readonly b: Point;
  readonly visible: boolean;
}

export interface StepRender {
  readonly number: number;
  readonly image: string;
  readonly glue: readonly GlueMark[];
}

export interface RenderSet {
  readonly cover: string;
  readonly steps: readonly StepRender[];
}
