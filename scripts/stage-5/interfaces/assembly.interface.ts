export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export interface Pose {
  readonly rotation: Mat3;
  readonly translation: Vec3;
}

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
  readonly areaMm2: number;
  readonly faces: readonly AssemblyFace[];
  readonly centre: Vec3;
  readonly tray: Vec2;
  readonly size: Vec2;
  readonly progressStart: number;
  readonly progressEnd: number;
}

export interface AssemblyChecks {
  readonly pieces: number;
  readonly faces: number;
  readonly hinges: number;
  readonly maxHingeResidualMm: number;
  readonly maxFoldAngleDeg: number;
  readonly mirroredPieces: number;
  readonly extraRoots: number;
}

export interface AssemblyDocument {
  readonly dimensionsMm: readonly number[];
  readonly pieces: readonly AssemblyPiece[];
  readonly checks: AssemblyChecks;
}

export interface FaceGeometry {
  readonly id: number;
  readonly flat: readonly Vec2[];
  readonly solid: readonly Vec3[];
  readonly vertexIds: readonly number[];
}

export interface FoldedPiece {
  readonly faces: readonly Omit<AssemblyFace, 'colour'>[];
  readonly residualMm: number;
  readonly maxAngleRad: number;
  readonly mirrored: boolean;
  readonly extraRoots: number;
}

export interface TrayParameters {
  readonly tray_gap_mm: number;
  readonly tray_row_width_mm: number;
}

export interface AssemblyParameters extends TrayParameters {
  readonly hinge_tolerance_mm: number;
}

export interface AssemblyStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly inputs: {
    readonly stage_dir: string;
    readonly net_resource: string;
    readonly texture_stage_dir: string;
    readonly texture_model: string;
  };
  readonly outputs: {
    readonly assembly_resource: string;
    readonly assembly_public: string;
    readonly public_url_pattern: string;
    readonly manifest: string;
  };
  readonly parameters: AssemblyParameters;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface Stage5Response {
  readonly name: string;
  readonly outputPath: string;
  readonly seconds: number;
}

export interface ColouredTriangle {
  readonly corners: readonly [Vec3, Vec3, Vec3];
  readonly colour: readonly [number, number, number];
}

export interface GltfColourAccessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
}

export interface GltfColourPrimitive {
  readonly attributes: { readonly POSITION: number; readonly TEXCOORD_0: number };
  readonly indices: number;
  readonly material: number;
}

export interface GltfColourDocument {
  readonly accessors: readonly GltfColourAccessor[];
  readonly bufferViews: readonly {
    readonly byteOffset?: number;
    readonly byteLength: number;
    readonly byteStride?: number;
  }[];
  readonly images: readonly { readonly bufferView: number }[];
  readonly textures: readonly { readonly source: number }[];
  readonly materials: readonly {
    readonly emissiveTexture?: { readonly index: number };
    readonly pbrMetallicRoughness?: {
      readonly baseColorTexture?: { readonly index: number };
    };
  }[];
  readonly meshes: readonly { readonly primitives: readonly GltfColourPrimitive[] }[];
}

export interface OrderedPiece {
  readonly number: number;
  readonly centreHeight: number;
  readonly neighbours: ReadonlySet<number>;
}

export interface TrayItem {
  readonly size: Vec2;
  readonly origin: Vec2;
}

export interface AssemblySourcePiece {
  readonly number: number;
  readonly faceIds: readonly number[];
  readonly faces: readonly (readonly Vec2[])[];
  readonly areaMm2: number;
}

export interface AssemblySource {
  readonly dimensionsMm: readonly number[];
  readonly meshScale: number;
  readonly mesh: {
    readonly vertices: readonly Vec3[];
    readonly faces: readonly (readonly number[])[];
  };
  readonly pieces: readonly AssemblySourcePiece[];
}
