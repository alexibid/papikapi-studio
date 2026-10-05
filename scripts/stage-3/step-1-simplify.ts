import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { ModelProfiles } from '../common/model-profiles.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  SimplifyResponse,
  SimplifyStatistics,
  SimplifyStepDefinition,
} from './interfaces/simplify.interface.js';

export class SimplifyGenerator {
  private static readonly stepId = 's3-step-1';

  private static resolveInputModel(modelName: string, step: SimplifyStepDefinition, pick?: number): string {
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    const pickCandidate = pick
      ? join(stageDir, step.inputs.model_pick_resource_pattern.replace('{pick}', String(pick)))
      : null;
    if (pickCandidate && existsSync(pickCandidate)) return pickCandidate;
    const candidate = join(stageDir, step.inputs.model_resource);
    if (!existsSync(candidate)) {
      throw new Error(`3D model not found for '${modelName}': ${candidate}`);
    }
    return candidate;
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<SimplifyResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as SimplifyStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const inputPath = this.resolveInputModel(modelName, step, requestedPick);
    const pointsPath = join(stageDir, step.outputs.points_resource);
    const meshPath = join(stageDir, step.outputs.mesh_resource);

    const parameters = { ...step.parameters, ...ModelProfiles.stepParameters(modelName, this.stepId) };

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<SimplifyStatistics>(step.blender, step.blender.script, {
      input_glb: inputPath,
      output_json: pointsPath,
      output_glb: meshPath,
      ...parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(meshPath, join(publicDir, step.outputs.mesh_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{points}', String(statistics.points))
      .replace('{meshFaces}', String(statistics.meshFaces))
      .replace('{quads}', String(statistics.quads))
      .replace('{deviation}', String(statistics.maxDeviationMm))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        points: statistics.points,
        meshFaces: statistics.meshFaces,
        quads: statistics.quads,
        openEdges: statistics.openEdges,
        nonManifoldEdges: statistics.nonManifoldEdges,
        airtight: statistics.airtight,
        volumeChangePercent: statistics.volumeChangePercent,
        maxDeviationMm: statistics.maxDeviationMm,
        featureLossMm: statistics.featureLossMm,
        mode: statistics.mode,
        alignedAreaRatio: statistics.alignedAreaRatio,
      },
      data: {
        source: inputPath,
        lengthMm: statistics.lengthMm,
        faces: statistics.faces,
        parameters,
      },
    });

    return { name: modelName, meshPath, pointsPath, seconds: duration };
  }
}
