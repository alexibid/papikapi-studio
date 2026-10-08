export interface OptimizeConfig {
  readonly blender: string;
  readonly realesrgan: {
    readonly variant: string;
    readonly weights: string;
    readonly tile: number;
    readonly pad: number;
  };
  readonly packages: readonly string[];
  readonly limits: {
    readonly max_hue_shift: number;
    readonly art_hue_share: number;
  };
  readonly panel: {
    readonly cell: number;
    readonly view_resolution: number;
  };
}

export interface OptimizeStatistics {
  readonly atlas: readonly [number, number];
  readonly texture: readonly [number, number];
  readonly usedShare: number;
  readonly hueShiftDegrees: number;
  readonly warnings: readonly string[];
  readonly seconds: Record<string, number>;
}

export interface OptimizeResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
  readonly statistics: OptimizeStatistics;
}
