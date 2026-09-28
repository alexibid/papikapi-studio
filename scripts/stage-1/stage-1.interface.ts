export interface TrellisStepInputs {
  readonly stage_dir: string;
  readonly art_resource: string;
  readonly art_public: string;
  readonly art_pick_resource_pattern: string;
  readonly art_pick_public_pattern: string;
  readonly allowed_extensions: readonly string[];
}

export interface TrellisStepOutputs {
  readonly stage_dir: string;
  readonly model_resource: string;
  readonly model_public: string;
  readonly model_pick_resource_pattern: string;
  readonly model_pick_public_pattern: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
}

export interface TrellisServerlessConfig {
  readonly env_endpoint_key: string;
  readonly container_image: string;
  readonly client_timeout_seconds: number;
  readonly api_url_pattern: string;
  readonly async_url_pattern: string;
  readonly status_url_pattern: string;
}

export interface TrellisStepParameters {
  readonly seed: number;
  readonly simplify: number;
  readonly target_faces: number;
  readonly texture_size: number;
  readonly ss_sampling_steps?: number;
  readonly slat_sampling_steps?: number;
  readonly ss_guidance_strength?: number;
  readonly slat_guidance_strength?: number;
}

export interface TrellisStepRunner {
  readonly platform: string;
  readonly device: string;
  readonly rate: string;
}

export interface TrellisStepMessages {
  readonly start: string;
  readonly progress: string;
  readonly completed: string;
  readonly cache_hit: string;
}

export interface TrellisManifestContract {
  readonly status: string;
  readonly costNote: string;
  readonly cache_cost_note: string;
  readonly data: {
    readonly format: string;
    readonly device: string;
  };
}

export interface TrellisStepDependsOn {
  readonly step_id: string;
  readonly stage_dir: string;
}

export interface TrellisStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly serverless: TrellisServerlessConfig;
  readonly depends_on: TrellisStepDependsOn;
  readonly inputs: TrellisStepInputs;
  readonly outputs: TrellisStepOutputs;
  readonly parameters: TrellisStepParameters;
  readonly runner: TrellisStepRunner;
  readonly messages: TrellisStepMessages;
  readonly manifest_contract: TrellisManifestContract;
}

export interface TrellisGenerateResponse {
  readonly name: string;
  readonly outputPath: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
  readonly cached?: boolean;
  readonly pick?: number;
}
