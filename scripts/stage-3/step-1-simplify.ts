import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { ModelProfiles } from '../common/model-profiles.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  SimplifyOutputs,
  SimplifyResponse,
  SimplifyStatistics,
  SimplifyStepDefinition,
} from './interfaces/simplify.interface.js';

export class SimplifyGenerator {
  private static readonly stepId = 's3-step-1';

  private static resolveInputModel(modelName: string, step: SimplifyStepDefinition, pick?: number): string {
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    const pickCandidate = pick && step.inputs.model_pick_resource_pattern
      ? join(stageDir, step.inputs.model_pick_resource_pattern.replace('{pick}', String(pick)))
      : null;
    if (pickCandidate && existsSync(pickCandidate)) return pickCandidate;
    const candidates = [step.inputs.model_resource, step.inputs.fallback_model_resource]
      .filter((name): name is string => typeof name === 'string')
      .map((name) => join(stageDir, name));
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error(`3D model not found for '${modelName}': ${candidates.join(' or ')}`);
    }
    return found;
  }

  private static outputPaths(stageDir: string, outputs: SimplifyOutputs): Record<keyof SimplifyOutputs, string> {
    const entries = Object.entries(outputs).map(([key, name]) => [key, join(stageDir, name)]);
    return Object.fromEntries(entries) as Record<keyof SimplifyOutputs, string>;
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<SimplifyResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as SimplifyStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const inputPath = this.resolveInputModel(modelName, step, requestedPick);
    const paths = this.outputPaths(stageDir, step.outputs);
    const parameters = { ...step.parameters, ...ModelProfiles.stepParameters(modelName, this.stepId) };

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const shape = BlenderRunner.run<SimplifyStatistics>(step.blender, step.blender.script, {
      input_glb: inputPath,
      output_json: paths.points_resource,
      output_glb: paths.model_resource,
      ...parameters,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{meshFaces}', String(shape.meshFaces))
      .replace('{quads}', String(shape.quads))
      .replace('{volume}', String(shape.volumeChangePercent))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        points: shape.points,
        meshFaces: shape.meshFaces,
        quads: shape.quads,
        airtight: shape.airtight,
        volumeChangePercent: shape.volumeChangePercent,
        dimensionChangePercent: shape.dimensionChangePercent,
        featureLossMm: shape.featureLossMm,
        maxDeviationMm: shape.maxDeviationMm,
        closingDeviationMm: shape.closingDeviationMm,
        innerWallShare: shape.innerWallShare,
        mode: shape.mode,
      },
      data: {
        source: inputPath,
        lengthMm: shape.lengthMm,
        faces: shape.faces,
        attempts: shape.attempts,
        parameters,
      },
    });

    return { name: modelName, modelPath: paths.model_resource, pointsPath: paths.points_resource, seconds: duration };
  }
}
