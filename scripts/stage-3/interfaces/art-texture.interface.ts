export interface RedrawParameters {
  readonly views: readonly string[];
  readonly reference_size_px: number;
  readonly columns: number;
  readonly rows: number;
  readonly endpoint_env_key: string;
  readonly prompt: string;
}

export interface RedrawCost {
  readonly seconds: number;
  readonly costUsd: number;
}

export interface ArtTextureScripts {
  readonly redraw_script: string;
  readonly texture_script: string;
  readonly apply_script: string;
}

export interface ArtTextureParameters {
  readonly texture_mode: 'art';
  readonly head_cells: number;
  readonly pixel_min_aligned_ratio: number;
  readonly organic_group_angle_deg: number;
  readonly organic_group_deviation_ratio: number;
  readonly organic_group_extent_ratio: number;
  readonly redraw: RedrawParameters;
}

export interface ArtTexturePaths {
  readonly meshPath: string;
  readonly artPath: string;
  readonly viewsDir: string;
  readonly workDir: string;
  readonly modelPath: string;
}

export interface FluxSheetOutput {
  readonly sheet_base64: string;
  readonly reference_images_used?: number;
}

export interface SelectedViewsStatistics {
  readonly views: Record<string, { candidate: number; overlap: number }>;
}

export interface ArtTextureStatistics {
  readonly regions: number;
  readonly palette: number;
  readonly smoothShapes: number;
  readonly cellSizeMm: number;
  readonly silhouetteIou: number;
  readonly azimuthDeg: number;
}

export interface AtlasModelStatistics {
  readonly faces: number;
}
