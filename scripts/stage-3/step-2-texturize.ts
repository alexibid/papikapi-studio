import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  BakeAtlasStatistics,
  TexturizeResponse,
  TexturizeStepDefinition,
} from './interfaces/texturize.interface.js';

export class TexturizeGenerator {
  private static readonly stepId = 's3-step-2';

  private static requireFile(path: string, description: string): string {
    if (!existsSync(path)) {
      throw new Error(`${description} not found: ${path}`);
    }
    return path;
  }

  private static resolveOptimizedModel(
    stageDir: string,
    step: TexturizeStepDefinition,
    pick?: number,
  ): string {
    const pickCandidate = pick
      ? join(stageDir, step.inputs.model_pick_resource_pattern.replace('{pick}', String(pick)))
      : undefined;
    if (pickCandidate && existsSync(pickCandidate)) return pickCandidate;
    return this.requireFile(
      join(stageDir, step.inputs.model_resource),
      'Optimized 3D model (run stage:2:step:4 first)',
    );
  }

  public static async execute(
    modelName: string,
    requestedPick?: number,
  ): Promise<TexturizeResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TexturizeStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });
    const modelStageDir = join(
      WorkspacePaths.resourcePath(modelName),
      step.inputs.model_stage_dir ?? 'stage-2',
    );
    const optimizedPath = this.resolveOptimizedModel(modelStageDir, step, requestedPick);
    const meshPath = this.requireFile(join(stageDir, step.inputs.mesh_resource), 'Simplified mesh');
    const modelPath = join(stageDir, step.outputs.model_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const bakeStats = BlenderRunner.run<BakeAtlasStatistics>(step.blender, step.blender.script, {
      base_glb: optimizedPath,
      reduce_json: meshPath,
      output_glb: modelPath,
      ...step.parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(modelPath, join(publicDir, step.outputs.model_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{faces}', String(bakeStats.faces))
      .replace('{resolution}', String(bakeStats.resolution))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: { faces: bakeStats.faces, resolution: bakeStats.resolution },
      data: { source: optimizedPath, parameters: step.parameters },
    });

    return { name: modelName, modelPath, seconds: duration };
  }
}
