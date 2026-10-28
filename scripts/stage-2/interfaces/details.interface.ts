import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface DetailsBlenderConfig extends BlenderConfig {
  readonly script: string;
}

export interface PaintedDetail {
  readonly texels: number;
  readonly eyeTexels: number;
  readonly staleTexels: number;
}

export interface DetailsStatistics {
  readonly artEyeSizesPx: readonly (readonly number[])[];
  readonly eyeHeightToFigure: number;
  readonly modelEyeSize: readonly number[];
  readonly painted: readonly PaintedDetail[];
}

export interface DetailsStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: DetailsBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly art_stage_dir: string;
    readonly art_resource: string;
  };
  readonly outputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly manifest: string;
  };
  readonly parameters: Readonly<Record<string, number>>;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface DetailsResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
