import { existsSync, readFileSync } from 'node:fs';
import type { PipelineConfig, PipelineStage, PipelineStep } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

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

  public static getStage(stageNumber: number): PipelineStage {
    const config = this.load();
    const stage = config.pipeline_stages.find((s) => s.stage.startsWith(`Stage ${stageNumber}:`));
    if (!stage) {
      throw new Error(`Stage ${stageNumber} not found in pipeline.json`);
    }
    return stage;
  }
}
