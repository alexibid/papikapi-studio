import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  DetailsResponse,
  DetailsStatistics,
  DetailsStepDefinition,
} from './interfaces/details.interface.js';

export class DetailsGenerator {
  private static readonly stepId = 's2-step-4';

  private static requireFile(modelName: string, stageDir: string, resource: string): string {
    const candidate = join(WorkspacePaths.resourcePath(modelName), stageDir, resource);
    if (!existsSync(candidate)) {
      throw new Error(`Input not found for '${modelName}': ${candidate}`);
    }
    return candidate;
  }

  public static async execute(modelName: string): Promise<DetailsResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as DetailsStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const inputPath = this.requireFile(modelName, step.inputs.stage_dir, step.inputs.model_resource);
    const artPath = this.requireFile(modelName, step.inputs.art_stage_dir, step.inputs.art_resource);
    const outputPath = join(stageDir, step.outputs.model_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<DetailsStatistics>(step.blender, step.blender.script, {
      input_glb: inputPath,
      art_image: artPath,
      output_glb: outputPath,
      ...step.parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const texels = statistics.painted.reduce((total, detail) => total + detail.texels, 0);
    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{details}', String(statistics.painted.length))
      .replace('{texels}', String(texels))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        details: statistics.painted.length,
        texels,
        eyeHeightToFigure: statistics.eyeHeightToFigure,
        modelEyeSize: statistics.modelEyeSize,
        artEyeSizesPx: statistics.artEyeSizesPx,
      },
      data: { source: inputPath, art: artPath, parameters: step.parameters, painted: statistics.painted },
    });

    return { name: modelName, modelPath: outputPath, seconds: duration };
  }
}
