import {
  Hinge,
  PaperFigure,
  PlacedCutEdge,
  PlacedDecor,
  PlacedFold,
  PlacedOverlay,
  PlacedPlate,
  Plate,
  Point2,
  UnfoldedFigure,
} from '../models/paper-figure';
import {
  angleOf,
  apply,
  applyToCurves,
  distance,
  IDENTITY,
  Rigid,
  rigidMapping,
  translate,
  translateCurves,
} from './rigid-transform';

const SHEET_WIDTH = 210;
const SHEET_HEIGHT = 297;
const MARGIN = 10;
const EDGE_LENGTH_TOLERANCE = 0.5;

export function unfoldFigure(figure: PaperFigure): UnfoldedFigure {
  const plateById = new Map(figure.plates.map((plate) => [plate.id, plate]));
  const root = plateById.get(figure.rootPlateId);

  if (!root) {
    return emptySheet([`Root plate '${figure.rootPlateId}' not found.`]);
  }

  const errors: string[] = [];
  const transforms = new Map<string, Rigid>([[root.id, IDENTITY]]);
  const folds: PlacedFold[] = [];

  walkHingeTree(figure, plateById, transforms, folds, errors);
  reportUnreachablePlates(figure, transforms, errors);

  const placed = figure.plates.flatMap((plate) => {
    const transform = transforms.get(plate.id);
    return transform ? [placePlate(plate, transform, hingedEdgesOf(plate, figure))] : [];
  });

  const offset = centreOnSheet(placed, errors);

  return {
    sheetWidth: SHEET_WIDTH,
    sheetHeight: SHEET_HEIGHT,
    plates: placed.map((plate) => shiftPlate(plate, offset)),
    folds: folds.map((fold) => ({
      ...fold,
      from: translate(fold.from, offset),
      to: translate(fold.to, offset),
    })),
    errors,
  };
}

interface PlacedParent {
  readonly plateId: string;
  readonly transform: Rigid;
}

function walkHingeTree(
  figure: PaperFigure,
  plateById: ReadonlyMap<string, Plate>,
  transforms: Map<string, Rigid>,
  folds: PlacedFold[],
  errors: string[]
): void {
  const childrenOf = groupHingesByParent(figure.hinges);
  const queue: PlacedParent[] = [{ plateId: figure.rootPlateId, transform: IDENTITY }];

  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const hinge of childrenOf.get(current.plateId) ?? []) {
      const parent = plateById.get(hinge.parentPlateId);
      const child = plateById.get(hinge.childPlateId);

      if (!parent || !child) {
        errors.push(`Hinge '${hinge.id}' references a missing plate.`);
        continue;
      }
      if (transforms.has(child.id)) {
        errors.push(`Plate '${child.id}' is reached by more than one hinge (cycle).`);
        continue;
      }

      const seam = resolveSeam(parent, child, hinge, current.transform, errors);
      if (!seam) continue;

      transforms.set(child.id, seam.transform);
      folds.push({ id: hinge.id, from: seam.from, to: seam.to, kind: hinge.kind });
      queue.push({ plateId: child.id, transform: seam.transform });
    }
  }
}

interface Seam {
  readonly transform: Rigid;
  readonly from: Point2;
  readonly to: Point2;
}

function resolveSeam(
  parent: Plate,
  child: Plate,
  hinge: Hinge,
  parentTransform: Rigid,
  errors: string[]
): Seam | undefined {
  const parentEdge = edgeOfAnchor(parent, hinge.parentAnchor);
  const childEdge = edgeOfAnchor(child, hinge.childAnchor);

  if (!parentEdge || !childEdge) {
    errors.push(`Hinge '${hinge.id}' points at an unknown anchor.`);
    return undefined;
  }
  if (isCurved(parent, hinge.parentAnchor) || isCurved(child, hinge.childAnchor)) {
    errors.push(`Hinge '${hinge.id}' folds along a curved edge; fold lines must be straight.`);
    return undefined;
  }

  const seamStart = apply(parentTransform, parentEdge[0]);
  const seamEnd = apply(parentTransform, parentEdge[1]);
  const seamLength = distance(seamStart, seamEnd);
  const childLength = distance(childEdge[0], childEdge[1]);

  if (Math.abs(seamLength - childLength) > EDGE_LENGTH_TOLERANCE) {
    errors.push(
      `Hinge '${hinge.id}' joins edges of different length ` +
        `(${seamLength.toFixed(1)}mm vs ${childLength.toFixed(1)}mm).`
    );
    return undefined;
  }

  return {
    transform: rigidMapping(childEdge[0], childEdge[1], seamEnd, seamStart),
    from: seamStart,
    to: seamEnd,
  };
}

function placePlate(plate: Plate, transform: Rigid, hingedEdges: ReadonlySet<number>): PlacedPlate {
  const outline = plate.outline.map((point) => apply(transform, point));
  const curves = applyToCurves(transform, plate.curves);
  const angle = angleOf(transform);

  const cutEdges: PlacedCutEdge[] = [];
  for (let edge = 0; edge < outline.length; edge++) {
    if (hingedEdges.has(edge)) continue;
    cutEdges.push({
      from: outline[edge],
      to: outline[(edge + 1) % outline.length],
      control: curves[edge],
    });
  }

  const overlays: PlacedOverlay[] = (plate.overlays ?? []).map((overlay) => ({
    id: overlay.id,
    hue: overlay.hue,
    outline: overlay.outline.map((point) => apply(transform, point)),
    curves: applyToCurves(transform, overlay.curves),
  }));

  const decor: PlacedDecor[] = (plate.decor ?? []).map((item) => {
    const [cx, cy] = apply(transform, [item.cx, item.cy]);
    return { ...item, cx, cy, angle };
  });

  return { id: plate.id, hue: plate.hue, outline, curves, cutEdges, overlays, decor };
}

function hingedEdgesOf(plate: Plate, figure: PaperFigure): ReadonlySet<number> {
  const edges = new Set<number>();
  for (const hinge of figure.hinges) {
    if (hinge.parentPlateId === plate.id) addAnchorEdge(edges, plate, hinge.parentAnchor);
    if (hinge.childPlateId === plate.id) addAnchorEdge(edges, plate, hinge.childAnchor);
  }
  return edges;
}

function addAnchorEdge(edges: Set<number>, plate: Plate, anchor: string): void {
  const index = plate.anchors[anchor];
  if (index !== undefined) edges.add(index);
}

function isCurved(plate: Plate, anchor: string): boolean {
  const index = plate.anchors[anchor];
  return index !== undefined && plate.curves?.[index] !== undefined;
}

function centreOnSheet(plates: readonly PlacedPlate[], errors: string[]): Point2 {
  const points = plates.flatMap((plate) => [...plate.outline, ...Object.values(plate.curves)]);
  if (points.length === 0) return [0, 0];

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

  if (width > SHEET_WIDTH - MARGIN * 2) {
    errors.push(`Figure is ${width.toFixed(0)}mm wide and does not fit the printable A4 width.`);
  }
  if (height > SHEET_HEIGHT - MARGIN * 2) {
    errors.push(`Figure is ${height.toFixed(0)}mm tall and does not fit the printable A4 height.`);
  }

  return [(SHEET_WIDTH - width) / 2 - minX, (SHEET_HEIGHT - height) / 2 - minY];
}

function reportUnreachablePlates(
  figure: PaperFigure,
  transforms: ReadonlyMap<string, Rigid>,
  errors: string[]
): void {
  for (const plate of figure.plates) {
    if (!transforms.has(plate.id)) {
      errors.push(`Plate '${plate.id}' is not connected to the root by any hinge.`);
    }
  }
}

function groupHingesByParent(hinges: readonly Hinge[]): ReadonlyMap<string, readonly Hinge[]> {
  const grouped = new Map<string, Hinge[]>();
  for (const hinge of hinges) {
    const bucket = grouped.get(hinge.parentPlateId) ?? [];
    bucket.push(hinge);
    grouped.set(hinge.parentPlateId, bucket);
  }
  return grouped;
}

function edgeOfAnchor(plate: Plate, anchor: string): readonly [Point2, Point2] | undefined {
  const index = plate.anchors[anchor];
  if (index === undefined || index < 0 || index >= plate.outline.length) return undefined;
  return [plate.outline[index], plate.outline[(index + 1) % plate.outline.length]];
}

function shiftPlate(plate: PlacedPlate, offset: Point2): PlacedPlate {
  return {
    ...plate,
    outline: plate.outline.map((point) => translate(point, offset)),
    curves: translateCurves(plate.curves, offset),
    cutEdges: plate.cutEdges.map((edge) => ({
      from: translate(edge.from, offset),
      to: translate(edge.to, offset),
      control: edge.control ? translate(edge.control, offset) : undefined,
    })),
    overlays: plate.overlays.map((overlay) => ({
      ...overlay,
      outline: overlay.outline.map((point) => translate(point, offset)),
      curves: translateCurves(overlay.curves, offset),
    })),
    decor: plate.decor.map((item) => ({ ...item, cx: item.cx + offset[0], cy: item.cy + offset[1] })),
  };
}

function emptySheet(errors: readonly string[]): UnfoldedFigure {
  return { sheetWidth: SHEET_WIDTH, sheetHeight: SHEET_HEIGHT, plates: [], folds: [], errors };
}
