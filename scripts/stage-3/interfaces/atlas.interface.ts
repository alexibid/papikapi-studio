import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface AtlasBlenderConfig extends BlenderConfig {
  readonly bake_script: string;
}

export interface AtlasFamily {
  readonly hex: string;
  readonly share: number;
}

export interface AtlasStatistics {
  readonly families: readonly AtlasFamily[];
  readonly missedTexels: number;
  readonly specksAbsorbed: number;
  readonly detailsKept: number;
  readonly detailTexels: number;
  readonly detailFamilies: readonly string[];
}

export interface AtlasOutputs {
  readonly stage_dir: string;
  readonly atlas_resource: string;
  readonly uv_resource: string;
  readonly manifest: string;
}

export interface AtlasStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: AtlasBlenderConfig;
  readonly atlas_script: string;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly points_resource: string;
    readonly detailed_stage_dir: string;
    readonly detailed_model_resource: string;
    readonly fallback_detailed_resource?: string;
  };
  readonly outputs: AtlasOutputs;
  readonly bake: Readonly<Record<string, number | string>>;
  readonly atlas: Readonly<Record<string, number>>;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface AtlasResponse {
  readonly name: string;
  readonly atlasPath: string;
  readonly uvPath: string;
  readonly seconds: number;
}
