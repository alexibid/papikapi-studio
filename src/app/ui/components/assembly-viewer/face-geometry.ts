import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { AssemblyFace } from '../../../domain/assembly/assembly-plan';

export function flatGeometry(face: AssemblyFace): BufferGeometry {
  return build(
    face.polygon.map(([x, y]) => [x, y, 0] as const),
    face,
  );
}

export function solidGeometry(face: AssemblyFace): BufferGeometry {
  return build(face.solid, face);
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
