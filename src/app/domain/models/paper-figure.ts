import { AgeTierId } from './age-tier';

export type Point2 = readonly [number, number];

export type FoldKind = 'mountain' | 'valley';

export type DecorKind = 'spot' | 'eye';

export type CurveMap = Readonly<Record<number, Point2>>;

export interface PlateDecor {
  readonly kind: DecorKind;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly hue: string;
}

export interface PlateOverlay {
  readonly id: string;
  readonly outline: readonly Point2[];
  readonly curves?: CurveMap;
  readonly hue: string;
}

export interface Plate {
  readonly id: string;
  readonly outline: readonly Point2[];
  readonly curves?: CurveMap;
  readonly hue: string;
  readonly anchors: Readonly<Record<string, number>>;
  readonly overlays?: readonly PlateOverlay[];
  readonly decor?: readonly PlateDecor[];
}

export interface Hinge {
  readonly id: string;
  readonly parentPlateId: string;
  readonly parentAnchor: string;
  readonly childPlateId: string;
  readonly childAnchor: string;
  readonly kind: FoldKind;
  readonly angle?: number;
  readonly stepOrder?: number;
  readonly label?: string;
  readonly description?: string;
}

export interface PaperFigure {
  readonly id: string;
  readonly name: string;
  readonly tierId: AgeTierId;
  readonly rootPlateId: string;
  readonly plates: readonly Plate[];
  readonly hinges: readonly Hinge[];
  readonly pitchAngle?: number;
}

export interface PlacedDecor extends PlateDecor {
  readonly angle: number;
}

export interface PlacedOverlay {
  readonly id: string;
  readonly outline: readonly Point2[];
  readonly curves: CurveMap;
  readonly hue: string;
}

export interface PlacedCutEdge {
  readonly from: Point2;
  readonly to: Point2;
  readonly control?: Point2;
}

export interface PlacedPlate {
  readonly id: string;
  readonly hue: string;
  readonly outline: readonly Point2[];
  readonly curves: CurveMap;
  readonly cutEdges: readonly PlacedCutEdge[];
  readonly overlays: readonly PlacedOverlay[];
  readonly decor: readonly PlacedDecor[];
}

export interface PlacedFold {
  readonly id: string;
  readonly from: Point2;
  readonly to: Point2;
  readonly kind: FoldKind;
}

export interface UnfoldedFigure {
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly plates: readonly PlacedPlate[];
  readonly folds: readonly PlacedFold[];
  readonly errors: readonly string[];
}
