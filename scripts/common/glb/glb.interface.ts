export interface Vertex {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

export type Triangle = readonly [number, number, number];

export interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices: number;
  mode: number;
  material: number;
}

export interface GltfDocument {
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: { byteLength: number }[];
  images: { bufferView: number; mimeType: string }[];
  meshes: { primitives: GltfPrimitive[] }[];
  [key: string]: unknown;
}

export interface GlbMesh {
  readonly document: GltfDocument;
  readonly image: Buffer;
  readonly vertices: Vertex[];
  readonly triangles: Triangle[];
}

export interface Rectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface HalfPlane {
  readonly axis: 'x' | 'z';
  readonly bound: number;
  readonly keepAbove: boolean;
}

export interface Side {
  readonly axis: 'x' | 'z';
  readonly bound: number;
  readonly outward: 1 | -1;
}

export interface Colour {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface PlinthPaletteParameters {
  readonly plinth_hue_min_deg: number;
  readonly plinth_hue_max_deg: number;
  readonly plinth_min_saturation: number;
  readonly plinth_min_value: number;
}

export interface PlinthParameters extends PlinthPaletteParameters {
  readonly flatten_tolerance_ratio: number;
  readonly edge_inset_ratio: number;
  readonly margin_ratio: number;
  readonly sheet_thickness_ratio: number;
  readonly sheet_gap_ratio: number;
  readonly sheet_span_ratio: number;
  readonly weld_epsilon: number;
  readonly fragment_min_triangles: number;
  readonly fragment_min_thickness_ratio: number;
}

export interface PlinthLayout {
  readonly plateTriangles: ReadonlySet<number>;
  readonly belowSurfaceTriangles: ReadonlySet<number>;
  readonly plateVertices: ReadonlySet<number>;
  readonly outline: Rectangle;
  readonly bottomLevel: number;
  readonly topLevel: number;
  readonly height: number;
}

export interface PlinthTrimResult {
  readonly glb: Buffer;
  readonly faceCount: number;
  readonly trimmed: boolean;
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
}

export interface FragmentParameters {
  readonly fragment_min_triangles: number;
  readonly fragment_min_thickness_ratio: number;
  readonly weld_epsilon: number;
}

export interface SheetParameters {
  readonly sheet_thickness_ratio: number;
  readonly sheet_gap_ratio: number;
  readonly sheet_span_ratio: number;
}

export interface BoundaryEdge {
  readonly from: number;
  readonly to: number;
}

export interface MeshInspection {
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
}
