import type { FragmentParameters, GlbMesh } from './glb.interface.js';
import { PositionComponents } from './position-components.js';

export class FragmentRemover {
  public static remove(mesh: GlbMesh, parameters: FragmentParameters): GlbMesh {
    const everything = mesh.triangles.map((_, index) => index);
    const groups = PositionComponents.group(mesh.vertices, mesh.triangles, everything, parameters.weld_epsilon);
    if (groups.length < 2) return mesh;

    const heights = mesh.vertices.map((vertex) => vertex.y);
    const minimumThickness = parameters.fragment_min_thickness_ratio * (Math.max(...heights) - Math.min(...heights));
    const doomed = new Set<number>();
    for (const group of groups) {
      if (this.isFragment(mesh, group, parameters.fragment_min_triangles, minimumThickness)) {
        group.forEach((index) => doomed.add(index));
      }
    }
    if (doomed.size === 0 || doomed.size === mesh.triangles.length) return mesh;
    return { ...mesh, triangles: mesh.triangles.filter((_, index) => !doomed.has(index)) };
  }

  private static isFragment(mesh: GlbMesh, group: readonly number[], minTriangles: number, minThickness: number): boolean {
    if (group.length < minTriangles) return true;
    const corners = group.flatMap((index) => mesh.triangles[index].map((vertexIndex) => mesh.vertices[vertexIndex]));
    const extent = (pick: (vertex: (typeof corners)[number]) => number): number => {
      const values = corners.map(pick);
      return Math.max(...values) - Math.min(...values);
    };
    const thinnest = Math.min(extent((v) => v.x), extent((v) => v.y), extent((v) => v.z));
    return thinnest < minThickness;
  }
}
