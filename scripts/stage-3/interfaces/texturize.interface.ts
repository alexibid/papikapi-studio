import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface TexturizeBlenderConfig extends BlenderConfig {
  readonly apply_script: string;
}

export interface TexturizeOutputs {
  readonly stage_dir: string;
  readonly model_resource: string;
  readonly model_public: string;
  readonly manifest: string;
}

export interface TexturizeStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: TexturizeBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly atlas_resource: string;
    readonly uv_resource: string;
  };
  readonly outputs: TexturizeOutputs;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface TexturizeResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
