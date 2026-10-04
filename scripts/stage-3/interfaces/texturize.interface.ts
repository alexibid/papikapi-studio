import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface TexturizeBlenderConfig extends BlenderConfig {
  readonly render_views_script: string;
  readonly project_reduce_script: string;
}

export interface CleanBaseStatistics {
  readonly plinthFound?: boolean;
  readonly facesBefore?: number;
  readonly facesAfter?: number;
  readonly removedIslands?: number;
  readonly removedFaces?: number;
  readonly outputGlb?: string;
}

export interface TexturizeStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: TexturizeBlenderConfig;
  readonly vectorizer_script: string;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_stage_dir?: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
    readonly views_dir?: string;
    readonly mesh_resource: string;
  };
  readonly outputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_public: string;
    readonly views_dir: string;
    readonly svg_dir: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly resolution: number;
    readonly margin: number;
    readonly min_facing: number;
    readonly flat_pattern?: string;
  };
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface RenderViewsStatistics {
  readonly viewsCount: number;
  readonly resolution: number;
  readonly boundsMin: readonly number[];
  readonly boundsMax: readonly number[];
  readonly centre: readonly number[];
}

export interface VectorizeStatistics {
  readonly viewsCount: number;
  readonly familiesCount: number;
  readonly baseHex: string;
  readonly totalPaths: number;
  readonly totalNodes: number;
  readonly views: Record<string, { paths: number; nodes: number; size: number }>;
  readonly palette: readonly {
    index: number;
    hex: string;
    share: number;
    kind: string;
  }[];
}

export interface ProjectReduceStatistics {
  readonly faces: number;
  readonly viewsUsage: Record<string, number>;
  readonly hiddenFaces: number;
  readonly outputGlb: string;
}

export interface TexturizeStatistics {
  readonly faces: number;
  readonly viewsCount: number;
  readonly resolution: number;
  readonly familiesCount: number;
  readonly baseHex: string;
  readonly totalPaths: number;
  readonly totalNodes: number;
  readonly hiddenFaces: number;
  readonly viewsUsage: Record<string, number>;
  readonly plinthFound?: boolean;
  readonly cleanFaces?: number;
}

export interface TexturizeResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
