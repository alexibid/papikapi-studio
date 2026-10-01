import type { Rectangle, Side, Triangle, Vertex } from './glb.interface.js';

export class PlinthWalls {
  public static build(
    vertices: readonly Vertex[],
    triangles: readonly Triangle[],
    rectangle: Rectangle,
    middleLevel: number,
    epsilon: number,
  ): Triangle[] {
    const boundaryVertices = this.boundaryVertices(triangles);
    return this.sides(rectangle).flatMap((side) => {
      const onSide = [...boundaryVertices].filter((index) => Math.abs(vertices[index][side.axis] - side.bound) < epsilon);
      const along = side.axis === 'x' ? 'z' : 'x';
      const sorted = (levelTest: (y: number) => boolean): number[] =>
        onSide.filter((index) => levelTest(vertices[index].y)).sort((a, b) => vertices[a][along] - vertices[b][along]);
      const top = sorted((y) => y > middleLevel);
      const bottom = sorted((y) => y <= middleLevel);
      if (top.length < 2 || bottom.length < 2) return [];
      return this.strip(vertices, top, bottom, along).map((triangle) => this.faceOutward(vertices, triangle, side));
    });
  }

  private static sides(rectangle: Rectangle): Side[] {
    return [
      { axis: 'x', bound: rectangle.minX, outward: -1 },
      { axis: 'x', bound: rectangle.maxX, outward: 1 },
      { axis: 'z', bound: rectangle.minZ, outward: -1 },
      { axis: 'z', bound: rectangle.maxZ, outward: 1 },
    ];
  }

  private static boundaryVertices(triangles: readonly Triangle[]): Set<number> {
    const edgeUses = new Map<string, number>();
    const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    for (const [a, b, c] of triangles) {
      [key(a, b), key(b, c), key(c, a)].forEach((edge) => edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1));
    }
    const boundary = new Set<number>();
    edgeUses.forEach((uses, edge) => {
      if (uses === 1) edge.split(':').forEach((index) => boundary.add(Number(index)));
    });
    return boundary;
  }

  private static strip(
    vertices: readonly Vertex[],
    top: readonly number[],
    bottom: readonly number[],
    along: 'x' | 'z',
  ): Triangle[] {
    const triangles: Triangle[] = [];
    let topIndex = 0;
    let bottomIndex = 0;
    while (topIndex < top.length - 1 || bottomIndex < bottom.length - 1) {
      const canAdvanceTop = topIndex < top.length - 1;
      const canAdvanceBottom = bottomIndex < bottom.length - 1;
      const advanceTop =
        canAdvanceTop &&
        (!canAdvanceBottom || vertices[top[topIndex + 1]][along] <= vertices[bottom[bottomIndex + 1]][along]);
      if (advanceTop) {
        triangles.push([top[topIndex], bottom[bottomIndex], top[topIndex + 1]]);
        topIndex++;
      } else {
        triangles.push([top[topIndex], bottom[bottomIndex], bottom[bottomIndex + 1]]);
        bottomIndex++;
      }
    }
    return triangles;
  }

  private static faceOutward(vertices: readonly Vertex[], triangle: Triangle, side: Side): Triangle {
    const [a, b, c] = triangle.map((index) => vertices[index]);
    const edgeOne = [b.x - a.x, b.y - a.y, b.z - a.z];
    const edgeTwo = [c.x - a.x, c.y - a.y, c.z - a.z];
    const normal = [
      edgeOne[1] * edgeTwo[2] - edgeOne[2] * edgeTwo[1],
      edgeOne[2] * edgeTwo[0] - edgeOne[0] * edgeTwo[2],
      edgeOne[0] * edgeTwo[1] - edgeOne[1] * edgeTwo[0],
    ];
    const facing = normal[side.axis === 'x' ? 0 : 2] * side.outward;
    return facing >= 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
  }
}
