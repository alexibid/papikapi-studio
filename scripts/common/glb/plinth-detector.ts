import type {
  PlinthLayout,
  PlinthParameters,
  Rectangle,
  Triangle,
  Vertex,
} from './glb.interface.js';
import { PlinthPalette } from './plinth-palette.js';
import { PositionComponents } from './position-components.js';
import type { TextureSampler } from './texture-sampler.js';

const OUTLINE_GROWTH_THRESHOLD = 1.05;
const UPWARD_NORMAL_LIMIT = 0.5;
const DOWNWARD_NORMAL_LIMIT = -0.3;
const MIN_PLINTH_SAMPLES = 2;
const LOWER_SEARCH_RATIO = 0.45;
const LEVEL_NORMAL_LIMIT = 0.9;

export class PlinthDetector {
  public static detect(
    vertices: readonly Vertex[],
    triangles: readonly Triangle[],
    parameters: PlinthParameters,
    texture: TextureSampler,
  ): PlinthLayout | null {
    const heights = vertices.map((vertex) => vertex.y);
    const minY = Math.min(...heights);
    const height = Math.max(...heights) - minY;
    const tolerance = parameters.flatten_tolerance_ratio * height;
    const band = this.dominantTop(vertices, triangles, minY, height, tolerance) + tolerance;

    const plateTriangles = new Set<number>();
    const upwardTriangles: number[] = [];
    const downwardTriangles = new Set<number>();
    const plateVertices = new Set<number>();
    const figureVertices = new Set<number>();
    triangles.forEach((triangle, index) => {
      const isPlate = triangle.every((vertexIndex) => vertices[vertexIndex].y < band);
      if (!isPlate) {
        triangle.forEach((vertexIndex) => figureVertices.add(vertexIndex));
        return;
      }
      plateTriangles.add(index);
      triangle.forEach((vertexIndex) => plateVertices.add(vertexIndex));
      const normalY = this.normalY(triangle, vertices);
      if (normalY > UPWARD_NORMAL_LIMIT) upwardTriangles.push(index);
      if (normalY < DOWNWARD_NORMAL_LIMIT) downwardTriangles.add(index);
    });
    if (figureVertices.size === 0 || plateVertices.size === 0) return null;

    const plinthTriangles = upwardTriangles.filter((index) =>
      this.isPlinthColoured(triangles[index], vertices, parameters, texture),
    );
    const mainPiece = this.largest(PositionComponents.group(vertices, triangles, plinthTriangles, parameters.weld_epsilon));
    const plateBox = this.boundingRectangle([...plateVertices].map((vertexIndex) => vertices[vertexIndex]));
    const colourBox =
      mainPiece === null
        ? plateBox
        : this.boundingRectangle(mainPiece.flatMap((index) => triangles[index].map((vertexIndex) => vertices[vertexIndex])));
    const footprint = this.boundingRectangle(
      [...figureVertices].map((vertexIndex) => vertices[vertexIndex]).filter((vertex) => vertex.y >= band),
    );
    const outline = this.intersect(colourBox, this.grow(footprint, parameters.margin_ratio));
    if (!this.exceeds(plateBox, outline)) return null;

    const topLevel = this.median(
      upwardTriangles
        .flatMap((index) => triangles[index].map((vertexIndex) => vertices[vertexIndex]))
        .filter((vertex) => this.contains(outline, vertex))
        .map((vertex) => vertex.y),
    );
    const insideOutline = [...plateVertices].map((vertexIndex) => vertices[vertexIndex]).filter((vertex) => this.contains(outline, vertex));
    const bottomLevel = Math.min(...insideOutline.map((vertex) => vertex.y));
    const belowSurfaceTriangles = new Set(
      [...plateTriangles].filter(
        (index) =>
          downwardTriangles.has(index) || triangles[index].some((vertexIndex) => vertices[vertexIndex].y < topLevel - tolerance),
      ),
    );
    return { plateTriangles, belowSurfaceTriangles, plateVertices, outline, bottomLevel, topLevel, height };
  }

  private static isPlinthColoured(
    triangle: Triangle,
    vertices: readonly Vertex[],
    parameters: PlinthParameters,
    texture: TextureSampler,
  ): boolean {
    const corners = triangle.map((index) => vertices[index]);
    const centre = {
      u: corners.reduce((sum, corner) => sum + corner.u, 0) / 3,
      v: corners.reduce((sum, corner) => sum + corner.v, 0) / 3,
    };
    const samples = [centre, ...corners.map((corner) => ({ u: (corner.u + centre.u) / 2, v: (corner.v + centre.v) / 2 }))];
    const hits = samples.filter((sample) => PlinthPalette.matches(texture.colourAt(sample.u, sample.v), parameters));
    return hits.length >= MIN_PLINTH_SAMPLES;
  }

  private static dominantTop(
    vertices: readonly Vertex[],
    triangles: readonly Triangle[],
    minY: number,
    height: number,
    tolerance: number,
  ): number {
    const searchLimit = minY + LOWER_SEARCH_RATIO * height;
    const areaByLevel = new Map<number, { area: number; levels: number[] }>();
    for (const triangle of triangles) {
      const corners = triangle.map((index) => vertices[index]);
      if (!corners.every((corner) => corner.y < searchLimit)) continue;
      const area = this.area(triangle, vertices);
      if (this.normalY(triangle, vertices) < LEVEL_NORMAL_LIMIT || area === 0) continue;
      const level = corners.reduce((sum, corner) => sum + corner.y, 0) / 3;
      const bin = Math.round(level / tolerance);
      const entry = areaByLevel.get(bin) ?? { area: 0, levels: [] };
      entry.area += area;
      entry.levels.push(level);
      areaByLevel.set(bin, entry);
    }
    const best = [...areaByLevel.values()].sort((a, b) => b.area - a.area)[0];
    if (best === undefined) return minY;
    return this.median(best.levels);
  }

  private static area(triangle: Triangle, vertices: readonly Vertex[]): number {
    const [a, b, c] = triangle.map((index) => vertices[index]);
    const crossX = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    const crossY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return Math.hypot(crossX, crossY, crossZ) / 2;
  }

  private static grow(footprint: Rectangle, ratio: number): Rectangle {
    const margin = ratio * Math.max(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ);
    return {
      minX: footprint.minX - margin,
      maxX: footprint.maxX + margin,
      minZ: footprint.minZ - margin,
      maxZ: footprint.maxZ + margin,
    };
  }

  private static intersect(first: Rectangle, second: Rectangle): Rectangle {
    return {
      minX: Math.max(first.minX, second.minX),
      maxX: Math.min(first.maxX, second.maxX),
      minZ: Math.max(first.minZ, second.minZ),
      maxZ: Math.min(first.maxZ, second.maxZ),
    };
  }

  private static largest(groups: readonly number[][]): number[] | null {
    if (groups.length === 0) return null;
    return groups.reduce((best, group) => (group.length > best.length ? group : best));
  }

  private static median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private static normalY(triangle: Triangle, vertices: readonly Vertex[]): number {
    const [a, b, c] = triangle.map((index) => vertices[index]);
    const crossY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    const crossX = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const length = Math.hypot(crossX, crossY, crossZ);
    return length === 0 ? 0 : crossY / length;
  }

  private static boundingRectangle(points: readonly Vertex[]): Rectangle {
    const xs = points.map((point) => point.x);
    const zs = points.map((point) => point.z);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }

  private static contains(rectangle: Rectangle, point: Vertex): boolean {
    return point.x >= rectangle.minX && point.x <= rectangle.maxX && point.z >= rectangle.minZ && point.z <= rectangle.maxZ;
  }

  private static exceeds(plate: Rectangle, outline: Rectangle): boolean {
    const plateSpan = Math.max(plate.maxX - plate.minX, plate.maxZ - plate.minZ);
    const outlineSpan = Math.max(outline.maxX - outline.minX, outline.maxZ - outline.minZ);
    return plateSpan > outlineSpan * OUTLINE_GROWTH_THRESHOLD;
  }
}
