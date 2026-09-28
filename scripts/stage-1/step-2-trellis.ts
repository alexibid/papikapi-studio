import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  TrellisGenerateResponse,
  TrellisStepDefinition,
} from './stage-1.interface.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { RunPodClient } from '../common/runpod-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export type { TrellisGenerateResponse };

export class TrellisGenerator {
  private static readonly stepId = 's1-step-2';

  private static findInputCutout(modelName: string, step: TrellisStepDefinition, pick?: number | null): string {
    const stage1Dir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);

    if (pick) {
      const pickCutouts = [
        join(stage1Dir, `step-1-art-pick-${pick}-cutout.png`),
        join(publicDir, `art-pick-${pick}-cutout.png`),
      ];
      for (const candidate of pickCutouts) {
        if (existsSync(candidate)) return candidate;
      }
    }

    const cutouts = [
      join(stage1Dir, 'step-1-art-cutout.png'),
      join(publicDir, 'art-cutout.png'),
    ];
    for (const candidate of cutouts) {
      if (existsSync(candidate)) return candidate;
    }

    const stage0Dir = join(WorkspacePaths.resourcePath(modelName), 'stage-0');
    const legacyArt = join(stage0Dir, 'step-1-art.jpeg');
    if (existsSync(legacyArt)) return legacyArt;

    throw new Error(`Cutout art not found for model '${modelName}'`);
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<TrellisGenerateResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TrellisStepDefinition;
    const stage1Dir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stage1Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const contract = step.manifest_contract;
    const step1Manifest = ManifestManager.readStepResult(modelName, step.depends_on.step_id);
    const pick = requestedPick !== undefined ? requestedPick : (step1Manifest?.data?.chosenPick ? Number(step1Manifest.data.chosenPick) : null);

    const outputPath = join(stage1Dir, step.outputs.model_resource);
    const publicPath = join(publicDir, step.outputs.model_public);
    const cachedResGlb = pick ? join(stage1Dir, step.outputs.model_pick_resource_pattern.replace('{pick}', String(pick))) : null;
    const cachedPubGlb = pick ? join(publicDir, step.outputs.model_pick_public_pattern.replace('{pick}', String(pick))) : null;

    const resCached = Boolean(cachedResGlb && existsSync(cachedResGlb) && statSync(cachedResGlb).size > 1000);
    const pubCached = Boolean(cachedPubGlb && existsSync(cachedPubGlb) && statSync(cachedPubGlb).size > 1000);
    const cachedGlb = resCached ? cachedResGlb : pubCached ? cachedPubGlb : null;

    if (cachedGlb && pick) {
      const sourceGlb = cachedGlb;
      copyFileSync(sourceGlb, outputPath);
      copyFileSync(sourceGlb, publicPath);
      if (cachedResGlb && !existsSync(cachedResGlb)) copyFileSync(sourceGlb, cachedResGlb);
      if (cachedPubGlb && !existsSync(cachedPubGlb)) copyFileSync(sourceGlb, cachedPubGlb);

      const cacheMsg = step.messages.cache_hit.replace('{pick}', String(pick));
      console.log(`  \x1b[32m${cacheMsg}\x1b[0m\n`);
      ProgressHub.report(modelName, this.stepId, cacheMsg);

      const config = PipelineConfigLoader.load();
      const cacheCostUsd = config.pricing.local_processing_usd !== undefined ? Number(config.pricing.local_processing_usd) : 0;

      ManifestManager.writeStepResult(modelName, this.stepId, {
        status: contract.status,
        seconds: 0.05,
        costUsd: cacheCostUsd,
        costNote: contract.cache_cost_note,
        metrics: { fileSize: statSync(outputPath).size },
        data: {
          cached: true,
          chosenPick: pick,
          format: contract.data.format,
        },
      });

      return {
        name: modelName,
        outputPath,
        publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
        seconds: 0.05,
        costUsd: cacheCostUsd,
        cached: true,
        pick,
      };
    }

    const inputPath = this.findInputCutout(modelName, step, pick);
    const params = step.parameters;
    const runner = step.runner;
    const config = PipelineConfigLoader.load();
    const usdPerSec = Number(config.pricing.runpod_trellis_usd_per_sec);

    if (existsSync(outputPath)) unlinkSync(outputPath);

    const envKey = step.serverless.env_endpoint_key ? step.serverless.env_endpoint_key : 'RUNPOD_TRELLIS_ENDPOINT_ID';
    const endpointId = RunPodClient.getEndpointId(envKey);
    const seed = params.seed;
    const simplify = params.simplify;
    const targetFaces = params.target_faces;
    const textureSize = params.texture_size;

    const imageBuffer = readFileSync(inputPath);
    const imageBase64 = imageBuffer.toString('base64');

    const payload = {
      image_base64: imageBase64,
      seed,
      simplify,
      target_faces: targetFaces,
      texture_size: textureSize,
    };

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const result = await RunPodClient.execute<typeof payload, { glb_base64: string; file_size: number; face_count: number }>(
      endpointId,
      payload,
      {
        timeoutMs: step.serverless.client_timeout_seconds * 1000,
        onProgress: (elapsed) => {
          const progressMsg = step.messages.progress
            .replace('{runner}', runner.platform)
            .replace('{device}', runner.device)
            .replace('{elapsed}', String(elapsed));
          process.stdout.write(`\r  \x1b[36m${progressMsg}\x1b[0m`);
          ProgressHub.report(modelName, this.stepId, progressMsg);
        },
      }
    );
    process.stdout.write('\r\x1b[K');

    const buffer = Buffer.from(result.output.glb_base64, 'base64');

    writeFileSync(outputPath, buffer);
    writeFileSync(publicPath, buffer);
    if (cachedResGlb) writeFileSync(cachedResGlb, buffer);
    if (cachedPubGlb) writeFileSync(cachedPubGlb, buffer);

    const duration = result.seconds;
    const costUsd = Math.round(duration * usdPerSec * 10000) / 10000;
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);

    const completedMsg = step.messages.completed
      .replace('{runner}', runner.platform)
      .replace('{sizeMb}', sizeMb)
      .replace('{duration}', String(duration))
      .replace('{costUsd}', costUsd.toFixed(4));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: contract.status,
      seconds: duration,
      costUsd,
      costNote: contract.costNote,
      metrics: { fileSize: buffer.length, faceCount: result.output.face_count },
      data: {
        fileSize: buffer.length,
        faceCount: result.output.face_count,
        format: contract.data.format,
        chosenPick: pick,
        cached: false,
        device: contract.data.device,
        parameters: { seed, simplify, target_faces: targetFaces, texture_size: textureSize },
      },
    });

    return {
      name: modelName,
      outputPath,
      publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
      seconds: duration,
      costUsd,
      cached: false,
      pick: pick !== null ? pick : undefined,
    };
  }
}
