import type { InlineImage } from '../common/interfaces/gemini.interface.js';

export interface AlternativesStepOutputs {
  readonly sheet_resource: string;
  readonly sheet_public: string;
  readonly prompt_public: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
}

export interface AlternativesServerlessConfig {
  readonly env_endpoint_key: string;
  readonly container_image: string;
  readonly client_timeout_seconds: number;
  readonly api_url_pattern: string;
  readonly async_url_pattern: string;
  readonly status_url_pattern: string;
}

export interface AlternativesManifestContract {
  readonly status: string;
  readonly costUsd: number;
  readonly costNote: string;
}

export interface AlternativesStepParameters {
  readonly default_model: string;
  readonly fallback_model: string;
  readonly inference_engine: string;
  readonly aspect_ratio: string;
  readonly columns: number;
  readonly rows: number;
  readonly alternatives_count: number;
  readonly max_reference_images: number;
  readonly system_prompt: string;
  readonly reference_rule: string;
  readonly default_pose: string;
  readonly plane_colours: readonly string[];
}

export interface AlternativesStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly serverless?: AlternativesServerlessConfig;
  readonly messages?: {
    readonly start?: string;
    readonly completed?: string;
  };
  readonly parameters: AlternativesStepParameters;
  readonly outputs: AlternativesStepOutputs;
  readonly manifest_contract: AlternativesManifestContract;
}

export interface GenerateAlternativesRequest {
  readonly name: string;
  readonly prompt: string;
  readonly referenceImages?: readonly InlineImage[];
  readonly engineOverride?: string;
}

export interface GenerateAlternativesResponse {
  readonly name: string;
  readonly prompt: string;
  readonly resourcePath: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
}

export interface PickStepInputs {
  readonly sheet_resource_prefix: string;
  readonly sheet_public_prefix: string;
  readonly allowed_extensions: readonly string[];
}

export interface PickStepOutputs {
  readonly stage_dir: string;
  readonly art_resource: string;
  readonly art_public: string;
  readonly art_pick_resource_pattern: string;
  readonly art_pick_public_pattern: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
}

export interface PickManifestContract {
  readonly status: string;
  readonly costUsd: number;
  readonly costNote: string;
}

export interface PickStepParameters {
  readonly default_pick: number;
  readonly jpeg_quality: number;
  readonly columns: number;
  readonly rows: number;
}

export interface PickStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly inputs: PickStepInputs;
  readonly outputs: PickStepOutputs;
  readonly parameters: PickStepParameters;
  readonly manifest_contract: PickManifestContract;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
}

export interface PickAlternativeRequest {
  readonly name: string;
  readonly pick: number;
}

export interface PickAlternativeResponse {
  readonly name: string;
  readonly pick: number;
  readonly resourceArtPath: string;
  readonly publicArtPath: string;
}

export interface FluxWorkerOutput {
  readonly sheet_base64: string;
  readonly mime?: string;
  readonly lora?: string | null;
  readonly reference_images_used?: number;
  readonly seeds?: readonly number[];
}


export interface TrellisInputStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly inputs: { readonly stage_dir: string; readonly art_resource: string };
  readonly outputs: {
    readonly stage_dir: string;
    readonly cutout_resource: string;
    readonly trellis_input_resource: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly python_script: string;
    readonly image_size: number;
    readonly plane_rgb: Readonly<Record<string, readonly [number, number, number]>>;
    readonly super_resolution: { readonly binary: string; readonly model: string; readonly scale: number };
  };
  readonly manifest_contract: { readonly status: string; readonly costUsd: number; readonly costNote: string };
  readonly messages: { readonly start: string; readonly completed: string };
}

export interface TrellisInputRequest {
  readonly name: string;
}

export interface TrellisInputResponse {
  readonly name: string;
  readonly cutoutPath: string;
  readonly trellisInputPath: string;
}
