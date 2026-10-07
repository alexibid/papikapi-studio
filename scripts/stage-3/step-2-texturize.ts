import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { PythonRunner } from '../common/python-runner.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  FacetViewsStatistics,
  ProjectReduceStatistics,
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
    const meshPath = this.requireFile(join(stageDir, step.inputs.mesh_resource), 'Simplified mesh');
    const modelPath = join(stageDir, step.outputs.model_resource);
    const svgDir = join(stageDir, step.outputs.svg_dir);
    const facetsDir = join(stageDir, step.outputs.facets_dir);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();

    const viewsDir = join(modelStageDir, step.inputs.views_dir ?? 'step-3-views');
    const viewsFile = join(viewsDir, 'views.json');
    if (!existsSync(viewsFile)) {
      throw new Error(`Orthographic views not found for '${modelName}': run the base step first (${viewsFile})`);
    }
    const viewsDocument = JSON.parse(readFileSync(viewsFile, 'utf8')) as { resolution: number };
    mkdirSync(svgDir, { recursive: true });

    const facetStats = BlenderRunner.run<FacetViewsStatistics>(step.blender, step.blender.facet_views_script, {
      base_glb: originalPath,
      reduce_json: meshPath,
      views_dir: viewsDir,
      output_dir: facetsDir,
    });

    const vectorStats = PythonRunner.run<VectorizeStatistics>(
      step.vectorizer_script,
      {
        views_dir: viewsDir,
        facets_dir: facetsDir,
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
        viewsCount: facetStats.viewsCount,
        resolution: viewsDocument.resolution,
        familiesCount: vectorStats.familiesCount,
        baseHex: vectorStats.baseHex,
        totalPaths: vectorStats.totalPaths,
        totalNodes: vectorStats.totalNodes,
        hiddenFaces: projectStats.hiddenFaces,
        viewsUsage: projectStats.viewsUsage,
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
