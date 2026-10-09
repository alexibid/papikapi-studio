import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { AssemblyFace, Vec3 } from '../../../domain/assembly/assembly-plan';

export interface FigureBounds {
  readonly minZ: number;
  readonly maxZ: number;
}

export function flatGeometry(face: AssemblyFace): BufferGeometry {
  return build(
    face.polygon.map(([x, y]) => [x, y, 0] as const),
    face,
  );
}

export function solidGeometry(face: AssemblyFace): BufferGeometry {
  return build(face.solid, face);
}

export function figureBounds(faces: readonly AssemblyFace[]): FigureBounds {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const face of faces) {
    for (const point of face.solid) {
      if (point[2] < minZ) minZ = point[2];
      if (point[2] > maxZ) maxZ = point[2];
    }
  }
  return {
    minZ: Number.isFinite(minZ) ? minZ : 0,
    maxZ: Number.isFinite(maxZ) ? maxZ : 1,
  };
}

export function pieceWireframeGeometry(
  faces: readonly AssemblyFace[],
  bounds: FigureBounds,
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const seen = new Set<string>();

  for (const face of faces) {
    const corners = face.solid;
    const count = corners.length;
    for (let i = 0; i < count; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % count];
      const key = edgeKey(a, b);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const colorA = rainbowColor(a[2], bounds);
      const colorB = rainbowColor(b[2], bounds);

      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function edgeKey(a: Vec3, b: Vec3): string | null {
  const kA = `${Math.round(a[0] * 10)},${Math.round(a[1] * 10)},${Math.round(a[2] * 10)}`;
  const kB = `${Math.round(b[0] * 10)},${Math.round(b[1] * 10)},${Math.round(b[2] * 10)}`;
  if (kA === kB) return null;
  return kA < kB ? `${kA}_${kB}` : `${kB}_${kA}`;
}

function rainbowColor(z: number, bounds: FigureBounds): Color {
  const span = bounds.maxZ - bounds.minZ || 1;
  const t = Math.max(0, Math.min(1, (z - bounds.minZ) / span));
  const hue = t * 0.82;
  return new Color().setHSL(hue, 1.0, 0.55);
}

function build(corners: readonly (readonly [number, number, number])[], face: AssemblyFace) {
  const triangles = ShapeUtils.triangulateShape(
    face.polygon.map(([x, y]) => new Vector2(x, y)),
    [],
  );
  const colour = new Color(face.colour);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute(
    'color',
    new Float32BufferAttribute(
      corners.flatMap(() => [colour.r, colour.g, colour.b]),
      3,
    ),
  );
  geometry.setIndex(triangles.flat());
  geometry.computeVertexNormals();
  return geometry;
}
