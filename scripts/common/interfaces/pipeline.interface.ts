export interface PromptTemplates {
  readonly specific_subject: string;
  readonly generic_category: string;
}

export interface StepParameters {
  readonly default_model?: string;
  readonly fallback_model?: string;
  readonly inference_engine?: string;
  readonly aspect_ratio?: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly alternatives_count?: number;
  readonly default_pick?: number;
  readonly max_reference_images?: number;
  readonly system_prompt?: string;
  readonly negative_prompt?: string;
  readonly prompt_templates?: PromptTemplates;
  readonly reference_note_template?: string;
  readonly maturity_descriptions?: readonly string[];
  readonly critical_rules?: readonly string[];
  readonly self_check?: readonly string[];
  readonly jpeg_quality?: number;
  readonly endpoint?: string;
  readonly seed?: number;
  readonly simplify?: number;
  readonly texture_size?: number;
  readonly [key: string]: unknown;
}

export interface PipelineStep {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly emoji: string;
  readonly expected_seconds: number;
  readonly script: string;
  readonly stage_dir: string;
  readonly depends_on?: {
    readonly step_id: string;
    readonly stage_dir: string;
  };
  readonly models_from?: string;
  readonly inputs?: Record<string, string>;
  readonly outputs: Record<string, string>;
  readonly parameters?: StepParameters;
  readonly messages?: {
    readonly start?: string;
    readonly completed?: string;
    readonly progress?: string;
    readonly cache_hit?: string;
    readonly [key: string]: string | undefined;
  };
  readonly files?: Record<string, string>;
  readonly serverless?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface PipelineStage {
  readonly stage: string;
  readonly steps: readonly PipelineStep[];
}

export interface PipelineConfig {
  readonly system: string;
  readonly workspace: {
    readonly models_dir: string;
    readonly resources_dir: string;
    readonly models_from: string;
    readonly sheet_language: string;
    readonly sheet_translations: string;
  };
  readonly pricing: {
    readonly runpod_trellis_usd_per_sec?: number;
    readonly runpod_flux_usd_per_sec?: number;
    readonly local_processing_usd?: number;
    readonly flux_models?: Record<string, number>;
    readonly [key: string]: unknown;
  };
  readonly pipeline_stages: readonly PipelineStage[];
}
