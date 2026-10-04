import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import { BlenderRunner } from '../common/blender-runner.js';
import type { Stage4Response, UnfoldStatistics, UnfoldStepDefinition } from './interfaces/stage-4.interface.js';

export class UnfoldGenerator {
  private static readonly stepId = 's4-step-1';

  private static resolveInputModel(modelName: string, step: UnfoldStepDefinition): string {
    const candidates = [
      join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir, step.inputs.model_resource),
      join(WorkspacePaths.resourcePath(modelName), 'stage-3', 'step-3-plinth.json'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-3', 'step-1-reduce.json'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-2', 'step-6-plinth.json'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-2', 'step-4-reduce.json'),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error(`Simplified model not found for '${modelName}': tried ${candidates.join(', ')}`);
    }
    return found;
  }

  public static async execute(modelName: string): Promise<Stage4Response> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as UnfoldStepDefinition;
    const stage4Dir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stage4Dir, { recursive: true });

    const inputPath = this.resolveInputModel(modelName, step);
    const outputPath = join(stage4Dir, step.outputs.net_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<UnfoldStatistics>(step.blender, step.blender.unfold_script, {
      input_mesh: inputPath,
      output_net: outputPath,
      target_size_mm: step.parameters.target_size_mm,
      weld_distance_mm: step.parameters.weld_distance_mm,
      min_face_area_mm2: step.parameters.min_face_area_mm2,
      flatten_iterations: step.parameters.flatten_iterations,
      piece_max_width_mm: step.parameters.piece_max_width_mm,
      piece_max_height_mm: step.parameters.piece_max_height_mm,
      piece_compactness: step.parameters.piece_compactness,
    });
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{islands}', String(statistics.pieces))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        faceCount: statistics.faceCount,
        quadCount: statistics.quadCount,
        pieces: statistics.pieces,
        smallestPieceFaces: statistics.smallestPieceFaces,
        shortestCutMm: statistics.shortestCutMm,
        unpairedEdges: statistics.unpairedEdges,
        nonManifoldEdges: statistics.nonManifoldEdges,
      },
      data: {
        source: inputPath,
        dimensionsMm: statistics.dimensionsMm,
        targetSizeMm: statistics.targetSizeMm,
      },
    });

    return { name: modelName, outputPath, seconds: duration };
  }
}
