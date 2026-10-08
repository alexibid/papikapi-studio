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
    readonly model_stage_dir?: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
    readonly mesh_resource: string;
  };
  readonly outputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_public: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly resolution: number;
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

export interface BakeAtlasStatistics {
  readonly faces: number;
  readonly resolution: number;
}

export interface TexturizeResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
