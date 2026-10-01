import type { Triangle, Vertex } from './glb-mesh.js';

export class PositionComponents {
  public static group(
    vertices: readonly Vertex[],
    triangles: readonly Triangle[],
    members: readonly number[],
    epsilon: number,
  ): number[][] {
    const parent = new Map<string, string>();
    const find = (key: string): string => {
      let root = key;
      while (parent.get(root) !== root) root = parent.get(root) as string;
      return root;
    };
    const keyOf = (vertexIndex: number): string => {
      const vertex = vertices[vertexIndex];
      return [vertex.x, vertex.y, vertex.z].map((value) => Math.round(value / epsilon)).join(':');
    };
    for (const index of members) {
      for (const vertexIndex of triangles[index]) {
        const key = keyOf(vertexIndex);
        if (!parent.has(key)) parent.set(key, key);
      }
      const [first, second, third] = triangles[index].map(keyOf);
      parent.set(find(second), find(first));
      parent.set(find(third), find(first));
    }
    const groups = new Map<string, number[]>();
    for (const index of members) {
      const root = find(keyOf(triangles[index][0]));
      groups.set(root, [...(groups.get(root) ?? []), index]);
    }
    return [...groups.values()];
  }
}
