import type { FoldKind, Point } from './net.interface';

export interface TabShape {
  readonly polygon: readonly Point[];
  readonly height: number;
  readonly outward: Point;
}

export type TabPlan = ReadonlyMap<string, TabShape>;

export interface ArtLine {
  readonly a: Point;
  readonly b: Point;
}

export interface ArtFold extends ArtLine {
  readonly kind: FoldKind | 'tab';
}

export interface ArtText {
  readonly text: string;
  readonly at: Point;
  readonly angle: number;
  readonly sizeMm: number;
  readonly bold: boolean;
}

export interface ArtworkSettings {
  readonly tab_height_mm: number;
  readonly edge_number_mm: number;
  readonly min_edge_number_mm: number;
  readonly piece_label_mm: number;
}

export interface PieceArtwork {
  readonly number: number;
  readonly faceIds: readonly number[];
  readonly faces: readonly (readonly Point[])[];
  readonly tabs: readonly (readonly Point[])[];
  readonly cuts: readonly ArtLine[];
  readonly folds: readonly ArtFold[];
  readonly texts: readonly ArtText[];
  readonly width: number;
  readonly height: number;
}

export interface ArtworkContext {
  readonly settings: ArtworkSettings;
  readonly labelPrefix: string;
  readonly printable: readonly [number, number];
  readonly tabs: TabPlan;
}
