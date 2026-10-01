import type {
  GlbMesh,
  MeshInspection,
  PlinthLayout,
  PlinthParameters,
  PlinthTrimResult,
  Rectangle,
  Triangle,
  Vertex,
} from './glb.interface.js';
import { GlbCodec } from './glb-codec.js';
import { PlinthDetector } from './plinth-detector.js';
import { PlinthWalls } from './plinth-walls.js';
import { FragmentRemover } from './fragment-remover.js';
import { MeshSealer } from './mesh-sealer.js';
import { SheetRemover } from './sheet-remover.js';
import { TextureSampler } from './texture-sampler.js';
import { PolygonClipper } from './polygon-clipper.js';

export class PlinthTrimmer {
  public static async apply(glb: Buffer, parameters: PlinthParameters): Promise<PlinthTrimResult> {
    const original = GlbCodec.read(glb);
    const cleaned = this.compact(FragmentRemover.remove(SheetRemover.remove(original, parameters), parameters));
    const texture = await TextureSampler.load(cleaned.image);
    const layout = PlinthDetector.detect(cleaned.vertices, cleaned.triangles, parameters, texture);
    const shaped = layout === null ? cleaned : this.trim(cleaned, layout, parameters);
    const sealed = MeshSealer.seal(shaped, parameters.weld_epsilon);
    const quality: MeshInspection = MeshSealer.inspect(sealed, parameters.weld_epsilon);
    const modified = layout !== null || sealed !== shaped || shaped.triangles.length !== original.triangles.length;
    if (!modified) return { glb, faceCount: original.triangles.length, trimmed: false, ...quality };
    return { glb: GlbCodec.write(sealed), faceCount: sealed.triangles.length, trimmed: true, ...quality };
  }

  private static trim(mesh: GlbMesh, layout: PlinthLayout, parameters: PlinthParameters): GlbMesh {
    const vertices = mesh.vertices.map((vertex) => ({ ...vertex }));
    this.flatten(vertices, layout, parameters);
    const rectangle = this.inset(layout.outline, parameters.edge_inset_ratio);
    const triangles = this.clipPlate(vertices, mesh.triangles, layout, rectangle, parameters.weld_epsilon);
    const middleLevel = (layout.bottomLevel + layout.topLevel) / 2;
    const bottom = this.buildBottom(vertices, triangles, rectangle, layout);
    const solid = [...triangles, ...bottom];
    const walls = PlinthWalls.build(vertices, solid, rectangle, middleLevel, parameters.weld_epsilon * 10);
    return this.compact({ ...mesh, vertices, triangles: [...solid, ...walls] });
  }

  private static flatten(vertices: Vertex[], layout: PlinthLayout, parameters: PlinthParameters): void {
    const tolerance = parameters.flatten_tolerance_ratio * layout.height;
    layout.plateVertices.forEach((index) => {
      const vertex = vertices[index];
      if (Math.abs(vertex.y - layout.topLevel) <= tolerance) vertex.y = layout.topLevel;
    });
  }

  private static inset(outline: Rectangle, ratio: number): Rectangle {
    const margin = ratio * Math.max(outline.maxX - outline.minX, outline.maxZ - outline.minZ);
    return {
      minX: outline.minX + margin,
      maxX: outline.maxX - margin,
      minZ: outline.minZ + margin,
      maxZ: outline.maxZ - margin,
    };
  }

  private static clipPlate(
    vertices: Vertex[],
    source: readonly Triangle[],
    layout: PlinthLayout,
    rectangle: Rectangle,
    epsilon: number,
  ): Triangle[] {
    const keyOf = (vertex: Vertex): string =>
      [vertex.x, vertex.y, vertex.z, vertex.u, vertex.v].map((value) => Math.round(value / epsilon)).join(':');
    const welded = new Map<string, number>();
    vertices.forEach((vertex, index) => {
      if (!welded.has(keyOf(vertex))) welded.set(keyOf(vertex), index);
    });
    const indexOf = (vertex: Vertex): number => {
      const key = keyOf(vertex);
      const existing = welded.get(key);
      if (existing !== undefined) return existing;
      vertices.push(vertex);
      welded.set(key, vertices.length - 1);
      return vertices.length - 1;
    };

    const result: Triangle[] = [];
    source.forEach((triangle, index) => {
      if (layout.belowSurfaceTriangles.has(index)) return;
      if (!layout.plateTriangles.has(index)) {
        result.push(triangle);
        return;
      }
      const corners = triangle.map((vertexIndex) => vertices[vertexIndex]);
      const polygon = PolygonClipper.clip(corners, rectangle);
      if (polygon.length < 3) return;
      const isUntouched = polygon.length === 3 && polygon.every((vertex, corner) => this.same(vertex, corners[corner]));
      const indices = isUntouched ? [...triangle] : polygon.map(indexOf);
      for (let fan = 1; fan < indices.length - 1; fan++) result.push([indices[0], indices[fan], indices[fan + 1]]);
    });
    return result;
  }

  private static buildBottom(
    vertices: Vertex[],
    triangles: readonly Triangle[],
    rectangle: Rectangle,
    layout: PlinthLayout,
  ): Triangle[] {
    const candidates = [...new Set(triangles.flat())].map((index) => vertices[index]);
    const exactTop = candidates.filter((vertex) => vertex.y === layout.topLevel);
    const topVertices = exactTop.length > 0 ? exactTop : candidates;
    const corners = [
      { x: rectangle.minX, z: rectangle.minZ },
      { x: rectangle.maxX, z: rectangle.minZ },
      { x: rectangle.maxX, z: rectangle.maxZ },
      { x: rectangle.minX, z: rectangle.maxZ },
    ];
    const [first, second, third, fourth] = corners.map((corner) => {
      const nearest = topVertices.reduce((best, vertex) =>
        Math.hypot(vertex.x - corner.x, vertex.z - corner.z) < Math.hypot(best.x - corner.x, best.z - corner.z) ? vertex : best,
      );
      vertices.push({ x: corner.x, y: layout.bottomLevel, z: corner.z, u: nearest.u, v: nearest.v });
      return vertices.length - 1;
    });
    return [
      [first, second, third],
      [first, third, fourth],
    ];
  }

  private static same(first: Vertex, second: Vertex): boolean {
    return first.x === second.x && first.y === second.y && first.z === second.z && first.u === second.u && first.v === second.v;
  }

  private static compact(mesh: GlbMesh): GlbMesh {
    const remap = new Map<number, number>();
    const vertices: Vertex[] = [];
    const triangles = mesh.triangles.map((triangle) => {
      const mapped = triangle.map((index) => {
        const known = remap.get(index);
        if (known !== undefined) return known;
        vertices.push(mesh.vertices[index]);
        remap.set(index, vertices.length - 1);
        return vertices.length - 1;
      });
      return [mapped[0], mapped[1], mapped[2]] as const;
    });
    return { ...mesh, vertices, triangles };
  }
}
