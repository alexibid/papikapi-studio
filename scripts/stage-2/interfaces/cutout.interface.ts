export interface CutoutResponse {
  readonly name: string;
  readonly outputPath: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
  readonly cached: boolean;
  readonly pick?: number;
}

export interface CutoutStepInputs {
  readonly stage_dir: string;
  readonly art_resource: string;
  readonly art_public: string;
  readonly allowed_extensions: readonly string[];
  readonly art_pick_resource_pattern: string;
}

export interface CutoutStepOutputs {
  readonly stage_dir: string;
  readonly cutout_resource: string;
  readonly cutout_public: string;
  readonly cutout_pick_resource_pattern: string;
  readonly cutout_pick_public_pattern: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
}

export interface CutoutStepMessages {
  readonly start: string;
  readonly completed: string;
  readonly cache_hit: string;
}

export interface CutoutManifestContract {
  readonly status: string;
  readonly costUsd: number;
  readonly costNote: string;
}

export interface CutoutStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly inputs: CutoutStepInputs;
  readonly outputs: CutoutStepOutputs;
  readonly messages: CutoutStepMessages;
  readonly manifest_contract: CutoutManifestContract;
}
