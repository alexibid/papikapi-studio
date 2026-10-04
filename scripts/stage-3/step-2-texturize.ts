import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { PythonRunner } from '../common/python-runner.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  ProjectReduceStatistics,
  RenderViewsStatistics,
  TexturizeResponse,
  TexturizeStepDefinition,
  VectorizeStatistics,
} from './interfaces/texturize.interface.js';

export class TexturizeGenerator {
  private static readonly stepId = 's3-step-2';

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
    mkdirSync(stageDir, { recursive: true });
    const modelStageDir = join(
      WorkspacePaths.resourcePath(modelName),
      step.inputs.model_stage_dir ?? 'stage-2',
    );
    const originalPath = this.resolveOriginal(modelStageDir, step, requestedPick);
    const meshCandidates = [
      join(stageDir, step.inputs.mesh_resource),
      join(stageDir, 'step-1-reduce.json'),
      join(stageDir, 'step-4-reduce.json'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-2', 'step-4-reduce.json'),
    ];
    const meshPath = meshCandidates.find((c) => existsSync(c));
    if (!meshPath) {
      throw new Error(`Simplified mesh not found for '${modelName}': tried ${meshCandidates.join(', ')}`);
    }
    const modelPath = join(stageDir, step.outputs.model_resource);
    const viewsDir = join(stageDir, step.outputs.views_dir);
    const svgDir = join(stageDir, step.outputs.svg_dir);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();

    const stage2ViewsDir = join(
      modelStageDir,
      step.inputs.views_dir ?? 'stage-2-step-3-views',
    );
    let renderStats: RenderViewsStatistics;

    if (existsSync(join(stage2ViewsDir, 'views.json'))) {
      mkdirSync(viewsDir, { recursive: true });
      const viewFiles = [
        'front.png',
        'back.png',
        'left.png',
        'right.png',
        'top.png',
        'bottom.png',
        'views.json',
      ];
      for (const file of viewFiles) {
        const src = join(stage2ViewsDir, file);
        if (existsSync(src)) {
          copyFileSync(src, join(viewsDir, file));
        }
      }
      renderStats = {
        viewsCount: 6,
        resolution: step.parameters.resolution,
        boundsMin: [0, 0, 0],
        boundsMax: [1, 1, 1],
      };
    } else {
      renderStats = BlenderRunner.run<RenderViewsStatistics>(
        step.blender,
        step.blender.render_views_script,
        {
          input_glb: originalPath,
          output_dir: viewsDir,
          resolution: step.parameters.resolution,
          margin: step.parameters.margin,
        },
      );
    }

    const vectorStats = PythonRunner.run<VectorizeStatistics>(
      step.vectorizer_script,
      {
        views_dir: viewsDir,
        output_dir: svgDir,
        resolution: step.parameters.resolution,
      },
    );

    const projectStats = BlenderRunner.run<ProjectReduceStatistics>(
      step.blender,
      step.blender.project_reduce_script,
      {
        reduce_json: meshPath,
        views_dir: viewsDir,
        flat_dir: svgDir,
        output_glb: modelPath,
        min_facing: step.parameters.min_facing,
        flat_pattern: 'flat_{name}.png',
      },
    );

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(modelPath, join(publicDir, step.outputs.model_public));

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{faces}', String(projectStats.faces))
      .replace('{totalPaths}', String(vectorStats.totalPaths))
      .replace('{totalNodes}', String(vectorStats.totalNodes))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        faces: projectStats.faces,
        viewsCount: renderStats.viewsCount,
        resolution: renderStats.resolution,
        familiesCount: vectorStats.familiesCount,
        baseHex: vectorStats.baseHex,
        totalPaths: vectorStats.totalPaths,
        totalNodes: vectorStats.totalNodes,
        hiddenFaces: projectStats.hiddenFaces,
        viewsUsage: projectStats.viewsUsage,
        plinthFound: false,
        cleanFaces: 0,
      },
      data: {
        source: originalPath,
        parameters: step.parameters,
        palette: vectorStats.palette,
      },
    });

    return { name: modelName, modelPath, seconds: duration };
  }
}
