import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageCutout } from '../common/image-cutout.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type { CutoutResponse, CutoutStepInputs } from './interfaces/cutout.interface.js';

export class CutoutGenerator {
  private static readonly stepId = 's2-step-1';

  private static findInputArt(modelName: string, stepInputs: CutoutStepInputs, pick?: number | null): string {
    const stage0Dir = join(WorkspacePaths.resourcePath(modelName), stepInputs.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);

    if (pick) {
      const pickResArt = join(stage0Dir, stepInputs.art_pick_resource_pattern.replace('{pick}', String(pick)));
      if (existsSync(pickResArt)) return pickResArt;
    }

    for (const ext of stepInputs.allowed_extensions) {
      const baseName = stepInputs.art_resource.replace(/\.[^/.]+$/, '');
      const candidate = join(stage0Dir, `${baseName}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    const publicCandidate = join(publicDir, stepInputs.art_public);
    if (existsSync(publicCandidate)) return publicCandidate;

    throw new Error(`Input art not found for model '${modelName}'`);
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<CutoutResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as {
      stage_dir: string;
      depends_on: { step_id: string; stage_dir: string };
      inputs: { stage_dir: string; art_resource: string; art_public: string; allowed_extensions: string[]; art_pick_resource_pattern: string };
      outputs: { cutout_resource: string; cutout_public: string; cutout_pick_resource_pattern: string; cutout_pick_public_pattern: string; public_url_pattern: string };
      messages: { start: string; completed: string; cache_hit: string };
      manifest_contract: { status: string; costUsd: number; costNote: string };
    };

    const stage1Dir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);

    mkdirSync(stage1Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const step2Manifest = ManifestManager.readStepResult(modelName, step.depends_on.step_id);
    const pick = requestedPick !== undefined ? requestedPick : (step2Manifest?.data?.chosenPick ? Number(step2Manifest.data.chosenPick) : null);

    const outputPath = join(stage1Dir, step.outputs.cutout_resource);
    const publicPath = join(publicDir, step.outputs.cutout_public);
    const cachedResCutout = pick ? join(stage1Dir, step.outputs.cutout_pick_resource_pattern.replace('{pick}', String(pick))) : null;
    const cachedPubCutout = pick ? join(publicDir, step.outputs.cutout_pick_public_pattern.replace('{pick}', String(pick))) : null;

    const resCached = Boolean(cachedResCutout && existsSync(cachedResCutout) && statSync(cachedResCutout).size > 500);
    const pubCached = Boolean(cachedPubCutout && existsSync(cachedPubCutout) && statSync(cachedPubCutout).size > 500);

    const cachedCutout = resCached ? cachedResCutout : pubCached ? cachedPubCutout : null;

    if (cachedCutout && pick) {
      const sourceCutout = cachedCutout;
      copyFileSync(sourceCutout, outputPath);
      copyFileSync(sourceCutout, publicPath);
      if (cachedResCutout && !existsSync(cachedResCutout)) copyFileSync(sourceCutout, cachedResCutout);
      if (cachedPubCutout && !existsSync(cachedPubCutout)) copyFileSync(sourceCutout, cachedPubCutout);

      const cacheMsg = step.messages.cache_hit.replace('{pick}', String(pick));
      console.log(`  \x1b[32m${cacheMsg}\x1b[0m`);
      ProgressHub.report(modelName, this.stepId, cacheMsg);

      ManifestManager.writeStepResult(modelName, this.stepId, {
        status: step.manifest_contract.status,
        seconds: 0.01,
        costUsd: 0.0,
        costNote: 'Local Cache Hit ($0.00)',
        metrics: { fileSize: statSync(outputPath).size },
        data: {
          cached: true,
          chosenPick: pick,
          format: 'image/png',
        },
      });

      return {
        name: modelName,
        outputPath,
        publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
        seconds: 0.01,
        costUsd: 0.0,
        cached: true,
        pick,
      };
    }

    const inputPath = this.findInputArt(modelName, step.inputs, pick);
    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const inputBuffer = readFileSync(inputPath);
    const cutoutBuffer = await ImageCutout.extractCutout({ imageBuffer: inputBuffer });

    writeFileSync(outputPath, cutoutBuffer);
    writeFileSync(publicPath, cutoutBuffer);
    if (cachedResCutout) writeFileSync(cachedResCutout, cutoutBuffer);
    if (cachedPubCutout) writeFileSync(cachedPubCutout, cutoutBuffer);

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: { fileSize: cutoutBuffer.length },
      data: {
        cached: false,
        chosenPick: pick,
        format: 'image/png',
      },
    });

    return {
      name: modelName,
      outputPath,
      publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
      seconds: duration,
      costUsd: 0.0,
      cached: false,
      pick: pick !== null ? pick : undefined,
    };
  }
}
