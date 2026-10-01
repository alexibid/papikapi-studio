import type { Color, PDFFont } from 'pdf-lib';
import type { NetPiece, StepRender } from './net.interface.js';
import type { PieceArtwork } from './artwork.interface.js';

export interface BookletFonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

export interface PageFrame {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly header: number;
}

export interface BookletSettings {
  readonly page_width_mm: number;
  readonly page_height_mm: number;
  readonly margin_mm: number;
  readonly header_mm: number;
  readonly piece_gap_mm: number;
  readonly nesting_cell_mm: number;
  readonly tab_height_mm: number;
  readonly edge_number_mm: number;
  readonly min_edge_number_mm: number;
  readonly piece_label_mm: number;
  readonly image_size_px: number;
  readonly texture_dpi: number;
  readonly texture_bleed_mm: number;
  readonly texture_jpeg_quality: number;
  readonly cage_extrusion_ratio: number;
  readonly max_ray_distance_ratio: number;
  readonly bake_samples: number;
}

export interface BookletModel {
  readonly name: string;
  readonly dimensions: string;
}

export interface LineStyle {
  readonly thickness: number;
  readonly color: Color;
  readonly dashArray?: readonly number[];
}

export interface CoverCounts {
  readonly pieces: number;
  readonly sheets: number;
}

export interface BookletSummary {
  readonly pages: number;
  readonly sheets: number;
  readonly pieces: number;
  readonly labelCollisions: number;
}

export interface StepEntry {
  readonly piece: NetPiece;
  readonly render: StepRender;
  readonly artwork: PieceArtwork;
  readonly sheet: number;
}
