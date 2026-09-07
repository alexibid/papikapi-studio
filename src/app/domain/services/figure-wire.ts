import { AgeTierId } from '../models/age-tier';
import {
  CurveMap,
  DecorKind,
  FoldKind,
  PaperFigure,
  Plate,
  PlateDecor,
  PlateOverlay,
  Point2,
} from '../models/paper-figure';
import { mirrorPlate } from './plate-geometry';

export interface WirePoint {
  readonly x: number;
  readonly y: number;
}

export interface WireCurve {
  readonly edge: number;
  readonly x: number;
  readonly y: number;
}

export interface WireAnchor {
  readonly name: string;
  readonly edge: number;
}

export interface WireDecor {
  readonly kind: DecorKind;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly hue: string;
}

export interface WireOverlay {
  readonly id: string;
  readonly hue: string;
  readonly outline: readonly WirePoint[];
  readonly curves?: readonly WireCurve[];
}

export interface WirePlate {
  readonly id: string;
  readonly hue: string;
  readonly outline?: readonly WirePoint[];
  readonly curves?: readonly WireCurve[];
  readonly anchors?: readonly WireAnchor[];
  readonly mirrorOf?: string;
  readonly overlays?: readonly WireOverlay[];
  readonly decor?: readonly WireDecor[];
}

export interface WireHinge {
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

export interface WireFigure {
  readonly id: string;
  readonly name: string;
  readonly rootPlateId: string;
  readonly plates: readonly WirePlate[];
  readonly hinges: readonly WireHinge[];
  readonly pitchAngle?: number;
}

export function parseWireFigure(wire: WireFigure, tierId: AgeTierId): PaperFigure {
  if (!wire.plates?.length) {
    throw new Error('Figure has no plates.');
  }
  if (!wire.hinges?.length) {
    throw new Error('Figure has no hinges; a single loose plate cannot be folded.');
  }

  const plates: Plate[] = [];
  for (const wirePlate of wire.plates) {
    plates.push(toPlate(wirePlate, plates));
  }

  return {
    id: wire.id || `figure-${Date.now()}`,
    name: wire.name || 'Untitled',
    tierId,
    rootPlateId: wire.rootPlateId || plates[0].id,
    plates,
    hinges: wire.hinges.map(toHinge),
    pitchAngle: wire.pitchAngle,
  };
}

function toPlate(wirePlate: WirePlate, built: readonly Plate[]): Plate {
  if (wirePlate.mirrorOf) {
    return mirrorSource(wirePlate, built);
  }

  if (!wirePlate.outline || wirePlate.outline.length < 3) {
    throw new Error(`Plate '${wirePlate.id}' needs at least 3 outline points.`);
  }

  return {
    id: wirePlate.id,
    hue: wirePlate.hue || '#cccccc',
    outline: wirePlate.outline.map(toPoint),
    curves: toCurves(wirePlate.curves),
    anchors: toAnchors(wirePlate.anchors ?? []),
    overlays: wirePlate.overlays?.map(toOverlay),
    decor: wirePlate.decor?.map(toDecor),
  };
}

function mirrorSource(wirePlate: WirePlate, built: readonly Plate[]): Plate {
  const source = built.find((plate) => plate.id === wirePlate.mirrorOf);
  if (!source) {
    throw new Error(
      `Plate '${wirePlate.id}' mirrors '${wirePlate.mirrorOf}', which is not defined before it.`
    );
  }
  return mirrorPlate(source, wirePlate.id);
}

function toHinge(wireHinge: WireHinge): WireHinge {
  if (wireHinge.parentPlateId === wireHinge.childPlateId) {
    throw new Error(`Hinge '${wireHinge.id}' joins a plate to itself.`);
  }
  return { ...wireHinge, kind: wireHinge.kind === 'valley' ? 'valley' : 'mountain' };
}

function toOverlay(overlay: WireOverlay): PlateOverlay {
  if (!overlay.outline || overlay.outline.length < 3) {
    throw new Error(`Overlay '${overlay.id}' needs at least 3 outline points.`);
  }
  return {
    id: overlay.id,
    hue: overlay.hue || '#ffffff',
    outline: overlay.outline.map(toPoint),
    curves: toCurves(overlay.curves),
  };
}

function toCurves(curves: readonly WireCurve[] | undefined): CurveMap | undefined {
  if (!curves?.length) return undefined;

  const map: Record<number, Point2> = {};
  for (const curve of curves) {
    map[curve.edge] = [curve.x, curve.y];
  }
  return map;
}

function toAnchors(anchors: readonly WireAnchor[]): Readonly<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const anchor of anchors) {
    map[anchor.name] = anchor.edge;
  }
  return map;
}

function toPoint(point: WirePoint): Point2 {
  return [point.x, point.y];
}

function toDecor(decor: WireDecor): PlateDecor {
  return { ...decor, kind: decor.kind === 'eye' ? 'eye' : 'spot' };
}
