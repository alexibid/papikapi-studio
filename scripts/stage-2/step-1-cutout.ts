import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageCutout } from '../common/image-cutout.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type { CutoutResponse, CutoutStepDefinition } from './interfaces/cutout.interface.js';

export class CutoutGenerator {
  private static readonly stepId = 's2-step-1';

  private static findInputArt(modelName: string, step: CutoutStepDefinition): string {
    const artPath = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir, step.inputs.art_resource);
    if (!existsSync(artPath)) {
      throw new Error(`Input art not found for model '${modelName}': ${artPath}`);
    }
    return artPath;
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<CutoutResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as CutoutStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
    const pick = requestedPick ?? ManifestManager.readStepResult(modelName, 's1-step-2')?.data?.chosenPick;

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const cutout = await ImageCutout.extractCutout({ imageBuffer: readFileSync(this.findInputArt(modelName, step)) });
    const outputPath = join(stageDir, step.outputs.cutout_resource);
    writeFileSync(outputPath, cutout);
    writeFileSync(join(publicDir, step.outputs.cutout_public), cutout);
    if (pick) {
      writeFileSync(join(stageDir, step.outputs.cutout_pick_resource_pattern.replace('{pick}', String(pick))), cutout);
      writeFileSync(join(publicDir, step.outputs.cutout_pick_public_pattern.replace('{pick}', String(pick))), cutout);
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const completedMsg = step.messages.completed.replace('{model}', modelName).replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: { fileSize: cutout.length },
      data: { format: 'image/png', chosenPick: pick ?? null },
    });

    return {
      name: modelName,
      outputPath,
      publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
      seconds: duration,
      costUsd: 0.0,
    };
  }
}
