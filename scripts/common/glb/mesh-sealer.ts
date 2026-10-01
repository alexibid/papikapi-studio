import type {
  BoundaryEdge,
  GlbMesh,
  MeshInspection,
  Triangle,
  Vertex,
} from './glb.interface.js';

const MAX_SEAL_ROUNDS = 8;

export class MeshSealer {
  public static seal(mesh: GlbMesh, epsilon: number): GlbMesh {
    let current = mesh;
    for (let round = 0; round < MAX_SEAL_ROUNDS; round++) {
      const next = this.sealOnce(current, epsilon);
      if (next === current) return current;
      current = next;
    }
    return current;
  }

  public static inspect(mesh: GlbMesh, epsilon: number): MeshInspection {
    const canonical = this.canonicalVertices(mesh.vertices, epsilon);
    const uses = new Map<string, number>();
    for (const triangle of mesh.triangles) {
      for (let corner = 0; corner < 3; corner++) {
        const from = canonical[triangle[corner]];
        const to = canonical[triangle[(corner + 1) % 3]];
        if (from === to) continue;
        const key = this.undirectedKey(from, to);
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    const counts = [...uses.values()];
    return {
      openEdges: counts.filter((count) => count === 1).length,
      nonManifoldEdges: counts.filter((count) => count > 2).length,
    };
  }

  private static sealOnce(mesh: GlbMesh, epsilon: number): GlbMesh {
    const canonical = this.canonicalVertices(mesh.vertices, epsilon);
    const kept = this.dropOverusedEdges(mesh.triangles, canonical, mesh.vertices);
    const boundary = this.boundaryEdges(kept, canonical);
    if (boundary.length === 0) return kept === mesh.triangles ? mesh : { ...mesh, triangles: [...kept] };

    const vertices = mesh.vertices.map((vertex) => ({ ...vertex }));
    const added: Triangle[] = [];
    for (const hole of this.holes(boundary)) {
      added.push(...this.cap(hole, vertices));
    }
    return { ...mesh, vertices, triangles: [...kept, ...added] };
  }

  private static canonicalVertices(vertices: readonly Vertex[], epsilon: number): number[] {
    const grid = new Map<string, number[]>();
    const cellOf = (vertex: Vertex): number[] => [vertex.x, vertex.y, vertex.z].map((value) => Math.floor(value / epsilon));
    return vertices.map((vertex, index) => {
      const [cellX, cellY, cellZ] = cellOf(vertex);
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            const neighbours = grid.get(`${cellX + offsetX}:${cellY + offsetY}:${cellZ + offsetZ}`) ?? [];
            const match = neighbours.find((other) => this.distance(vertices[other], vertex) <= epsilon);
            if (match !== undefined) return match;
          }
        }
      }
      const key = `${cellX}:${cellY}:${cellZ}`;
      grid.set(key, [...(grid.get(key) ?? []), index]);
      return index;
    });
  }

  private static distance(first: Vertex, second: Vertex): number {
    return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
  }

  private static undirectedKey(first: number, second: number): string {
    return first < second ? `${first}:${second}` : `${second}:${first}`;
  }

  private static dropOverusedEdges(
    triangles: readonly Triangle[],
    canonical: readonly number[],
    vertices: readonly Vertex[],
  ): readonly Triangle[] {
    const users = new Map<string, number[]>();
    triangles.forEach((triangle, index) => {
      for (let corner = 0; corner < 3; corner++) {
        const from = canonical[triangle[corner]];
        const to = canonical[triangle[(corner + 1) % 3]];
        if (from === to) continue;
        const key = this.undirectedKey(from, to);
        users.set(key, [...(users.get(key) ?? []), index]);
      }
    });
    const doomed = new Set<number>();
    users.forEach((list) => {
      if (list.length <= 2) return;
      const bySize = [...list].sort((a, b) => this.area(triangles[b], vertices) - this.area(triangles[a], vertices));
      bySize.slice(2).forEach((index) => doomed.add(index));
    });
    return doomed.size === 0 ? triangles : triangles.filter((_, index) => !doomed.has(index));
  }

  private static boundaryEdges(triangles: readonly Triangle[], canonical: readonly number[]): BoundaryEdge[] {
    const edges = new Map<string, BoundaryEdge[]>();
    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner++) {
        const from = canonical[triangle[corner]];
        const to = canonical[triangle[(corner + 1) % 3]];
        if (from === to) continue;
        const key = this.undirectedKey(from, to);
        edges.set(key, [...(edges.get(key) ?? []), { from, to }]);
      }
    }
    return [...edges.values()].filter((list) => list.length === 1).map((list) => list[0]);
  }

  private static holes(boundary: readonly BoundaryEdge[]): BoundaryEdge[][] {
    const parent = new Map<number, number>();
    const find = (vertex: number): number => {
      let root = vertex;
      while (parent.get(root) !== root) root = parent.get(root) as number;
      return root;
    };
    for (const edge of boundary) {
      if (!parent.has(edge.from)) parent.set(edge.from, edge.from);
      if (!parent.has(edge.to)) parent.set(edge.to, edge.to);
      parent.set(find(edge.to), find(edge.from));
    }
    const groups = new Map<number, BoundaryEdge[]>();
    for (const edge of boundary) {
      const root = find(edge.from);
      groups.set(root, [...(groups.get(root) ?? []), edge]);
    }
    return [...groups.values()];
  }

  private static cap(hole: readonly BoundaryEdge[], vertices: Vertex[]): Triangle[] {
    const members = [...new Set(hole.flatMap((edge) => [edge.from, edge.to]))].map((index) => vertices[index]);
    const mean = (pick: (vertex: Vertex) => number): number =>
      members.reduce((sum, vertex) => sum + pick(vertex), 0) / members.length;
    vertices.push({ x: mean((v) => v.x), y: mean((v) => v.y), z: mean((v) => v.z), u: mean((v) => v.u), v: mean((v) => v.v) });
    const centre = vertices.length - 1;
    return hole.map((edge) => [edge.to, edge.from, centre] as const);
  }

  private static area(triangle: Triangle, vertices: readonly Vertex[]): number {
    const [a, b, c] = triangle.map((index) => vertices[index]);
    const crossX = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    const crossY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return Math.hypot(crossX, crossY, crossZ) / 2;
  }
}
