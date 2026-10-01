import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface TexturizeBlenderConfig extends BlenderConfig {
  readonly script: string;
}

export interface TexturizeStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: TexturizeBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
    readonly mesh_resource: string;
    readonly art_resource: string;
  };
  readonly outputs: {
    readonly model_resource: string;
    readonly model_public: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly atlas_size_px: number;
    readonly island_padding_px: number;
    readonly bleed_px: number;
    readonly cage_extrusion_ratio: number;
    readonly max_ray_distance_ratio: number;
    readonly bake_samples: number;
    readonly jpeg_quality: number;
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

export interface TexturizeStatistics {
  readonly faces: number;
  readonly texelsPerMm: number;
  readonly azimuth: number;
  readonly elevation: number;
  readonly silhouetteScore: number;
  readonly colourDisagreement: number;
  readonly visibleShare: number;
}

export interface TexturizeResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
