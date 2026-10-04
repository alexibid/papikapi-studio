import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import { Booklet } from './booklet.js';
import type { NetDocument, RenderSet } from './interfaces/net.interface.js';
import { PageTextures } from './page-textures.js';
import { SheetTranslations } from './sheet-translations.js';
import type { SheetsStepDefinition, Stage4Response } from './interfaces/stage-4.interface.js';

export class SheetsExporter {
  private static readonly stepId = 's4-step-2';

  private static displayName(modelName: string): string {
    return modelName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private static requireFile(path: string, description: string): string {
    if (!existsSync(path)) {
      throw new Error(`${description} not found: ${path}`);
    }
    return path;
  }

  private static readJson<T>(path: string): T {
    return JSON.parse(readFileSync(this.requireFile(path, 'Required file'), 'utf8')) as T;
  }

  public static async execute(modelName: string): Promise<Stage4Response> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as SheetsStepDefinition;
    const stage4Dir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(publicDir, { recursive: true });

    const netCandidates = [
      join(stage4Dir, step.inputs.net_resource),
      join(WorkspacePaths.resourcePath(modelName), 'stage-4', 'step-1-net.json'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-3', 'step-1-net.json'),
    ];
    const netPath = netCandidates.find((c) => existsSync(c));
    if (!netPath) {
      throw new Error(`Net document not found for '${modelName}': tried ${netCandidates.join(', ')}`);
    }

    const textureCandidates = [
      join(
        WorkspacePaths.resourcePath(modelName),
        step.inputs.texture_stage_dir,
        step.inputs.texture_model,
      ),
      join(WorkspacePaths.resourcePath(modelName), 'stage-3', 'step-3-plinth.glb'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-3', 'step-2-texturize.glb'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-2', 'step-6-plinth.glb'),
      join(WorkspacePaths.resourcePath(modelName), 'stage-2', 'step-5-texturize.glb'),
    ];
    const texturedModelPath = textureCandidates.find((c) => existsSync(c));
    if (!texturedModelPath) {
      throw new Error(`Textured simplified model not found for '${modelName}': tried ${textureCandidates.join(', ')}`);
    }

    const rendersDir = join(stage4Dir, step.outputs.renders_dir);
    const rendersPath = join(rendersDir, 'renders.json');
    const outputPath = join(stage4Dir, step.outputs.sheets_resource);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    rmSync(rendersDir, { recursive: true, force: true });
    BlenderRunner.run<{ steps: number }>(step.blender, step.blender.render_script, {
      input_net: netPath,
      output_dir: rendersDir,
      output_renders: rendersPath,
      image_size_px: step.parameters.image_size_px,
    });
    const net = this.readJson<NetDocument>(netPath);
    const textures = new PageTextures({
      blender: step.blender,
      modelPath: texturedModelPath,
      netPath,
      directory: join(stage4Dir, 'step-2-textures'),
      settings: step.parameters,
    });
    const summary = await Booklet.build(
      net,
      this.readJson<RenderSet>(rendersPath),
      step.parameters,
      SheetTranslations.forConfiguredLanguage(),
      {
        name: this.displayName(modelName),
        dimensions: net.dimensionsMm.map((side) => Math.round(side)).join(' x '),
      },
      outputPath,
      textures.bake,
    );
    textures.discard();
    copyFileSync(outputPath, join(publicDir, step.outputs.sheets_public));
    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{pages}', String(summary.pages))
      .replace('{sheets}', String(summary.sheets))
      .replace('{pieces}', String(summary.pieces))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        pageCount: summary.pages,
        sheetCount: summary.sheets,
        pieceCount: summary.pieces,
        labelCollisions: summary.labelCollisions,
      },
      data: {
        format: 'application/pdf',
        pageSize: `${step.parameters.page_width_mm}x${step.parameters.page_height_mm}mm`,
      },
    });

    return { name: modelName, outputPath, seconds: duration };
  }
}
