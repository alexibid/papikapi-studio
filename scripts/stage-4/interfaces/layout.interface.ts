import type { PieceArtwork } from './artwork.interface.js';
import type { BookletSettings, PageFrame } from './booklet.interface.js';
import type { Point } from './net.interface.js';
import type { PapercraftBlenderConfig } from './stage-4.interface.js';

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type QuarterTurns = 0 | 1 | 2 | 3;

export interface Placement {
  readonly artwork: PieceArtwork;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly turns: QuarterTurns;
}

export interface TextureFace {
  readonly id: number;
  readonly page: number;
  readonly points: readonly Point[];
}

export interface TextureLayout {
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly pages: number;
  readonly faces: readonly TextureFace[];
}

export interface PageTextureSource {
  readonly blender: PapercraftBlenderConfig;
  readonly modelPath: string;
  readonly netPath: string;
  readonly directory: string;
  readonly settings: BookletSettings;
}

export type PageBaker = (placements: readonly Placement[], frame: PageFrame) => readonly string[];

export interface BakedPages {
  readonly pages: readonly string[];
}
