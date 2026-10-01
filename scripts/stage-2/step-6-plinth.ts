import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type { PlinthResponse, PlinthStatistics, PlinthStepDefinition } from './interfaces/plinth.interface.js';

export class PlinthGenerator {
  private static readonly stepId = 's2-step-6';

  private static requireFile(path: string, description: string): string {
    if (!existsSync(path)) {
      throw new Error(`${description} not found: ${path}`);
    }
    return path;
  }

  public static async execute(modelName: string): Promise<PlinthResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as PlinthStepDefinition;
    const inputDir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    const outputDir = join(WorkspacePaths.resourcePath(modelName), step.outputs.stage_dir);
    const reducedPath = this.requireFile(join(inputDir, step.inputs.mesh_resource), 'Simplified mesh');
    const texturedPath = this.requireFile(join(inputDir, step.inputs.model_resource), 'Textured model');
    const modelPath = join(outputDir, step.outputs.model_resource);
    const meshPath = join(outputDir, step.outputs.mesh_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<PlinthStatistics>(step.blender, step.blender.script, {
      input_mesh: reducedPath,
      input_glb: texturedPath,
      output_glb: modelPath,
      output_json: meshPath,
      ...step.parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(modelPath, join(publicDir, step.outputs.model_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{faces}', String(statistics.faces))
      .replace('{loops}', String(statistics.loops))
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
        loops: statistics.loops,
        openEdges: statistics.openEdges,
        nonManifoldEdges: statistics.nonManifoldEdges,
      },
      data: { source: texturedPath, parameters: step.parameters },
    });

    return { name: modelName, modelPath, meshPath, seconds: duration };
  }
}
