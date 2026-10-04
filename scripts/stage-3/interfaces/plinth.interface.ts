import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface PlinthBlenderConfig extends BlenderConfig {
  readonly script: string;
}

export interface PlinthStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: PlinthBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly mesh_resource: string;
    readonly model_resource: string;
  };
  readonly outputs: {
    readonly stage_dir: string;
    readonly mesh_resource: string;
    readonly model_resource: string;
    readonly model_public: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly plinth_thickness_ratio: number;
    readonly plinth_slope_ratio: number;
    readonly plinth_margin_ratio: number;
    readonly face_max_extent_ratio: number;
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

export interface PlinthStatistics {
  readonly faces: number;
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
  readonly thickness: number;
  readonly loops: number;
}

export interface PlinthResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly meshPath: string;
  readonly seconds: number;
}
