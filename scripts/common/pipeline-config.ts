import { existsSync, readFileSync } from 'node:fs';
import type { PipelineConfig, PipelineStage, PipelineStep, PromptTemplates, StepParameters } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

export type { PromptTemplates, StepParameters, PipelineStep, PipelineStage, PipelineConfig };

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
