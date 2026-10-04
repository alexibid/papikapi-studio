import { readFileSync, writeFileSync } from 'node:fs';
import { GlbCodec } from './glb-codec.js';
import type { GlbMesh, Triangle, Vertex } from './glb-mesh.js';

export interface FiniteRepair {
  readonly mesh: GlbMesh;
  readonly removedVertices: number;
  readonly removedTriangles: number;
}

export interface FileRepair {
  readonly removedVertices: number;
  readonly removedTriangles: number;
}

export class GlbRepair {
  public static finiteOnly(mesh: GlbMesh): FiniteRepair {
    const finite = mesh.vertices.map((vertex) => this.isFinite(vertex));
    const kept = mesh.triangles.filter((triangle) => triangle.every((index) => finite[index]));
    if (kept.length === mesh.triangles.length && finite.every(Boolean)) {
      return { mesh, removedVertices: 0, removedTriangles: 0 };
    }
    const compacted = this.compact(mesh, kept);
    return {
      mesh: compacted,
      removedVertices: mesh.vertices.length - compacted.vertices.length,
      removedTriangles: mesh.triangles.length - kept.length,
    };
  }

  public static ensureFinite(path: string): FileRepair {
    const repair = this.finiteOnly(GlbCodec.read(readFileSync(path)));
    if (repair.removedVertices > 0 || repair.removedTriangles > 0) {
      writeFileSync(path, GlbCodec.write(repair.mesh));
    }
    return { removedVertices: repair.removedVertices, removedTriangles: repair.removedTriangles };
  }

  private static isFinite(vertex: Vertex): boolean {
    return [vertex.x, vertex.y, vertex.z, vertex.u, vertex.v].every(Number.isFinite);
  }

  private static compact(mesh: GlbMesh, triangles: readonly Triangle[]): GlbMesh {
    const remap = new Map<number, number>();
    const vertices: Vertex[] = [];
    const number = (index: number): number => this.renumber(index, mesh.vertices, remap, vertices);
    const renumbered = triangles.map((triangle): Triangle => [number(triangle[0]), number(triangle[1]), number(triangle[2])]);
    return { ...mesh, vertices, triangles: renumbered };
  }

  private static renumber(index: number, source: readonly Vertex[], remap: Map<number, number>, target: Vertex[]): number {
    const known = remap.get(index);
    if (known !== undefined) return known;
    target.push({ ...source[index] });
    remap.set(index, target.length - 1);
    return target.length - 1;
  }
}
