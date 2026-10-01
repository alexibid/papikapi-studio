import type { InlineImage } from '../common/interfaces/gemini.interface.js';

export interface AlternativesStepOutputs {
  readonly sheet_resource: string;
  readonly sheet_public: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
}

export interface AlternativesServerlessConfig {
  readonly env_endpoint_key: string;
  readonly container_image: string;
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
  readonly negative_prompt: string;
  readonly prompt_templates: {
    readonly specific_subject: string;
    readonly generic_category: string;
  };
  readonly style_reference_note: string;
  readonly reference_note_template: string;
  readonly view_clause: string;
  readonly base_clause: string;
  readonly training_caption_view_phrase: string;
  readonly cell_prompt_templates: readonly string[];
  readonly maturity_descriptions: readonly string[];
  readonly critical_rules: readonly string[];
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

export interface ReferenceComposition {
  readonly hasStyle: boolean;
  readonly subjectCount: number;
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
}

