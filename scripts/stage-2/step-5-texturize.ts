import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  TexturizeResponse,
  TexturizeStatistics,
  TexturizeStepDefinition,
} from './interfaces/texturize.interface.js';

export class TexturizeGenerator {
  private static readonly stepId = 's2-step-5';

  private static requireFile(path: string, description: string): string {
    if (!existsSync(path)) {
      throw new Error(`${description} not found: ${path}`);
    }
    return path;
  }

  private static resolveOriginal(
    stageDir: string,
    step: TexturizeStepDefinition,
    pick?: number,
  ): string {
    const pickCandidate = pick
      ? join(stageDir, step.inputs.model_pick_resource_pattern.replace('{pick}', String(pick)))
      : undefined;
    if (pickCandidate && existsSync(pickCandidate)) return pickCandidate;
    return this.requireFile(join(stageDir, step.inputs.model_resource), 'Textured 3D model');
  }

  public static async execute(
    modelName: string,
    requestedPick?: number,
  ): Promise<TexturizeResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TexturizeStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const originalPath = this.resolveOriginal(stageDir, step, requestedPick);
    const meshPath = this.requireFile(join(stageDir, step.inputs.mesh_resource), 'Simplified mesh');
    const artPath = this.requireFile(join(stageDir, step.inputs.art_resource), 'Cutout art');
    const modelPath = join(stageDir, step.outputs.model_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<TexturizeStatistics>(step.blender, step.blender.script, {
      input_glb: originalPath,
      input_mesh: meshPath,
      input_art: artPath,
      output_glb: modelPath,
      ...step.parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(modelPath, join(publicDir, step.outputs.model_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{faces}', String(statistics.faces))
      .replace('{texels}', String(statistics.texelsPerMm))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        faces: statistics.faces,
        texelsPerMm: statistics.texelsPerMm,
        azimuth: statistics.azimuth,
        elevation: statistics.elevation,
        silhouetteScore: statistics.silhouetteScore,
        colourDisagreement: statistics.colourDisagreement,
        visibleShare: statistics.visibleShare,
      },
      data: { source: originalPath, parameters: step.parameters },
    });

    return { name: modelName, modelPath, seconds: duration };
  }
}
