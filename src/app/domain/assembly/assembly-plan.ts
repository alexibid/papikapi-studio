export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];

export interface FoldHinge {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly angleRad: number;
}

export interface PlacedPose {
  readonly position: Vec3;
  readonly quaternion: Quaternion;
}

export interface AssemblyFace {
  readonly id: number;
  readonly parent: number;
  readonly depth: number;
  readonly polygon: readonly Vec2[];
  readonly solid: readonly Vec3[];
  readonly colour: string;
  readonly hinge?: FoldHinge;
  readonly pose?: PlacedPose;
}

export interface AssemblyPiece {
  readonly number: number;
  readonly faces: readonly AssemblyFace[];
  readonly tray: Vec2;
  readonly progressStart: number;
  readonly progressEnd: number;
}

export interface AssemblyPlan {
  readonly pieces: readonly AssemblyPiece[];
}
