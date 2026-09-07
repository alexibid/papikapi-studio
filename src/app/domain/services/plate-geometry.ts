import { CurveMap, Plate, PlateDecor, PlateOverlay, Point2 } from '../models/paper-figure';

export function mirrorPlate(plate: Plate, id: string): Plate {
  const count = plate.outline.length;

  return {
    ...plate,
    id,
    outline: reverse(plate.outline.map(flip)),
    curves: remapCurves(plate.curves, count),
    anchors: remapAnchors(plate.anchors, count),
    overlays: plate.overlays?.map(mirrorOverlay),
    decor: plate.decor?.map(mirrorDecor),
  };
}

function mirrorOverlay(overlay: PlateOverlay): PlateOverlay {
  return {
    ...overlay,
    outline: reverse(overlay.outline.map(flip)),
    curves: remapCurves(overlay.curves, overlay.outline.length),
  };
}

function mirroredEdge(edge: number, count: number): number {
  return (((count - 2 - edge) % count) + count) % count;
}

function remapAnchors(
  anchors: Readonly<Record<string, number>>,
  count: number
): Readonly<Record<string, number>> {
  const remapped: Record<string, number> = {};
  for (const [name, edge] of Object.entries(anchors)) {
    remapped[name] = mirroredEdge(edge, count);
  }
  return remapped;
}

function remapCurves(curves: CurveMap | undefined, count: number): CurveMap | undefined {
  if (!curves) return undefined;

  const remapped: Record<number, Point2> = {};
  for (const [edge, control] of Object.entries(curves)) {
    remapped[mirroredEdge(Number(edge), count)] = flip(control);
  }
  return remapped;
}

function flip(point: Point2): Point2 {
  return [point[0], -point[1]];
}

function mirrorDecor(decor: PlateDecor): PlateDecor {
  return { ...decor, cy: -decor.cy };
}

function reverse<T>(items: readonly T[]): readonly T[] {
  return [...items].reverse();
}
