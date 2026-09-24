import { existsSync, readFileSync } from 'node:fs';
import { WorkspacePaths } from './workspace-paths.js';

export interface PromptTemplates {
  readonly specific_subject: string;
  readonly generic_category: string;
}

export interface StepParameters {
  readonly default_model?: string;
  readonly fallback_model?: string;
  readonly aspect_ratio?: string;
  readonly columns?: number;
  readonly rows?: number;
  readonly alternatives_count?: number;
  readonly max_reference_images?: number;
  readonly system_prompt?: string;
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
  readonly script: string;
  readonly models_from?: string;
  readonly inputs?: Record<string, string>;
  readonly outputs?: Record<string, string>;
  readonly parameters?: StepParameters;
  readonly messages?: {
    readonly start?: string;
    readonly completed?: string;
  };
  readonly files?: Record<string, string>;
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
  };
  readonly pricing: {
    readonly recraft_vectorize_usd: number;
    readonly runpod_trellis_usd_per_sec: number;
    readonly gemini_models: Record<string, number>;
  };
  readonly pipeline_stages: readonly PipelineStage[];
}

export class PipelineConfigLoader {
  private static cachedConfig: PipelineConfig | null = null;

  public static load(): PipelineConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    if (!existsSync(WorkspacePaths.pipelineFile)) {
      throw new Error(`Pipeline configuration not found at ${WorkspacePaths.pipelineFile}`);
    }

    const raw = readFileSync(WorkspacePaths.pipelineFile, 'utf8');
    this.cachedConfig = JSON.parse(raw) as PipelineConfig;
    return this.cachedConfig;
  }

  public static getStep(stepId: string): PipelineStep {
    const config = this.load();
    for (const stage of config.pipeline_stages) {
      const found = stage.steps.find((s) => s.id === stepId);
      if (found) {
        return found;
      }
    }
    throw new Error(`Step '${stepId}' not found in pipeline.json`);
  }

  public static getStage(stageIndex: number): PipelineStage {
    const config = this.load();
    const stage = config.pipeline_stages[stageIndex];
    if (!stage) {
      throw new Error(`Stage index ${stageIndex} not found in pipeline.json`);
    }
    return stage;
  }
}
