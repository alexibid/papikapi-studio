import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { GlbRepair } from '../common/glb/glb-repair.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  BaseResponse,
  BaseStatistics,
  BaseStepDefinition,
} from './interfaces/base.interface.js';

export class BaseCutGenerator {
  private static readonly stepId = 's2-step-3';

  private static resolveInputModel(
    modelName: string,
    step: BaseStepDefinition,
    pick?: number,
  ): string {
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

  public static async execute(modelName: string, requestedPick?: number): Promise<BaseResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as BaseStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const inputPath = this.resolveInputModel(modelName, step, requestedPick);
    const outputPath = join(stageDir, step.outputs.model_resource);
    const repair = GlbRepair.ensureFinite(inputPath);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const statistics = BlenderRunner.run<BaseStatistics>(step.blender, step.blender.script, {
      input_glb: inputPath,
      output_glb: outputPath,
      ...step.parameters,
    });

    const viewsDirName = step.outputs.views_dir ?? 'stage-2-step-3-views';
    const viewsDir = join(stageDir, viewsDirName);
    const viewsScript = step.blender.views_script ?? 'scripts/stage-2/blender/base/render_base_views.py';
    BlenderRunner.run(step.blender, viewsScript, {
      input_glb: outputPath,
      output_dir: viewsDir,
      resolution: 2048,
      margin: 0.0,
    });

    const rootViewsDir = join(WorkspacePaths.resourcePath(modelName), 'stage-2-step-3-views');
    if (rootViewsDir !== viewsDir) {
      if (existsSync(rootViewsDir)) {
        rmSync(rootViewsDir, { recursive: true, force: true });
      }
      cpSync(viewsDir, rootViewsDir, { recursive: true });
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    if (requestedPick) {
      copyFileSync(
        outputPath,
        join(
          stageDir,
          step.outputs.model_pick_resource_pattern.replace('{pick}', String(requestedPick)),
        ),
      );
    }

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{faces}', String(statistics.faces))
      .replace('{removedIslands}', String(statistics.removedIslands))
      .replace('{width}', String(statistics.widthMm))
      .replace('{length}', String(statistics.lengthMm))
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
        openEdges: statistics.openEdges,
        nonManifoldEdges: statistics.nonManifoldEdges,
        airtight: statistics.airtight,
        removedIslands: statistics.removedIslands,
        loops: statistics.loops,
        widthMm: statistics.widthMm,
        lengthMm: statistics.lengthMm,
        marginRatio: statistics.marginRatio,
        repairedVertices: repair.removedVertices,
        repairedTriangles: repair.removedTriangles,
      },
      data: { source: inputPath, parameters: step.parameters },
    });

    return { name: modelName, modelPath: outputPath, seconds: duration };
  }
}
