import type { GlbMesh, SheetParameters, Vertex } from './glb.interface.js';

export class SheetRemover {
  public static remove(mesh: GlbMesh, parameters: SheetParameters): GlbMesh {
    const heights = mesh.vertices.map((vertex) => vertex.y);
    const bottom = Math.min(...heights);
    const height = Math.max(...heights) - bottom;
    const layerTop = bottom + parameters.sheet_thickness_ratio * height;
    const layer = mesh.vertices.filter((vertex) => vertex.y <= layerTop);
    const upper = mesh.vertices.filter((vertex) => vertex.y > layerTop);
    if (layer.length === 0 || upper.length === 0) return mesh;

    const gap = Math.min(...upper.map((vertex) => vertex.y)) - layerTop;
    const isSeparated = gap >= parameters.sheet_gap_ratio * height;
    const isWider = this.span(layer) > parameters.sheet_span_ratio * this.span(upper);
    if (!isSeparated || !isWider) return mesh;

    const inLayer = (index: number): boolean => mesh.vertices[index].y <= layerTop;
    return { ...mesh, triangles: mesh.triangles.filter((triangle) => !triangle.some(inLayer)) };
  }

  private static span(vertices: readonly Vertex[]): number {
    const xs = vertices.map((vertex) => vertex.x);
    const zs = vertices.map((vertex) => vertex.z);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  }
}
