import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  TexturizeResponse,
  TexturizeStepDefinition,
} from './interfaces/texturize.interface.js';

export class TexturizeGenerator {
  private static readonly stepId = 's3-step-3';

  private static resolveFile(candidates: readonly string[], description: string): string {
    const found = candidates.find((c) => existsSync(c));
    if (!found) {
      throw new Error(`${description} not found. Tried: ${candidates.join(', ')}`);
    }
    return found;
  }

  public static async execute(modelName: string): Promise<TexturizeResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TexturizeStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const simpleCandidates = [
      join(stageDir, step.inputs.model_resource),
      join(stageDir, 'step-1-simplify.glb'),
    ];
    const simplePath = this.resolveFile(simpleCandidates, 'Simplified mesh');

    const atlasCandidates = [
      join(stageDir, step.inputs.atlas_resource),
      join(stageDir, 'step-2-atlas.png'),
    ];
    const atlasPath = this.resolveFile(atlasCandidates, 'Atlas texture');

    const uvCandidates = [
      join(stageDir, step.inputs.uv_resource),
      join(stageDir, 'step-2-atlas.json'),
      join(stageDir, 'step-1-atlas-uv.json'),
    ];
    const uvPath = uvCandidates.find((c) => existsSync(c));

    const outputPath = join(stageDir, step.outputs.model_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    BlenderRunner.run(step.blender, step.blender.apply_script, {
      input_glb: simplePath,
      atlas_png: atlasPath,
      uv_json: uvPath,
      output_glb: outputPath,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(outputPath, join(publicDir, step.outputs.model_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      data: {
        sourceMesh: simplePath,
        atlasImage: atlasPath,
      },
    });

    return { name: modelName, modelPath: outputPath, seconds: duration };
  }
}
