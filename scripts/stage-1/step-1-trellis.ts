import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  TrellisGenerateResponse,
  TrellisStepDefinition,
} from './stage-1.interface.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { RunPodClient } from '../common/runpod-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export type { TrellisGenerateResponse };

export class TrellisGenerator {
  private static readonly stepId = 's1-step-1';

  private static findInputArt(modelName: string, step: TrellisStepDefinition): string {
    const stage0Dir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    for (const ext of step.inputs.allowed_extensions) {
      const baseName = step.inputs.art_resource.replace(/\.[^/.]+$/, '');
      const candidate = join(stage0Dir, `${baseName}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    const publicCandidate = join(WorkspacePaths.modelPath(modelName), step.inputs.art_public);
    if (existsSync(publicCandidate)) return publicCandidate;

    throw new Error(`Input art not found for model '${modelName}'`);
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<TrellisGenerateResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TrellisStepDefinition;
    const stage0Dir = join(WorkspacePaths.resourcePath(modelName), step.inputs.stage_dir);
    const stage1Dir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stage1Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const contract = step.manifest_contract;
    const step2Manifest = ManifestManager.readStepResult(modelName, step.depends_on.step_id);
    const pick = requestedPick !== undefined ? requestedPick : (step2Manifest?.data?.chosenPick ? Number(step2Manifest.data.chosenPick) : null);

    const outputPath = join(stage1Dir, step.outputs.model_resource);
    const publicPath = join(publicDir, step.outputs.model_public);
    const cachedResGlb = pick ? join(stage1Dir, step.outputs.model_pick_resource_pattern.replace('{pick}', String(pick))) : null;
    const cachedPubGlb = pick ? join(publicDir, step.outputs.model_pick_public_pattern.replace('{pick}', String(pick))) : null;

    const resCached = Boolean(cachedResGlb && existsSync(cachedResGlb) && statSync(cachedResGlb).size > 1000);
    const pubCached = Boolean(cachedPubGlb && existsSync(cachedPubGlb) && statSync(cachedPubGlb).size > 1000);
    const hasCachedGlb = resCached ? true : pubCached;

    if (hasCachedGlb && pick) {
      const sourceGlb = resCached ? cachedResGlb! : cachedPubGlb!;
      copyFileSync(sourceGlb, outputPath);
      copyFileSync(sourceGlb, publicPath);
      if (cachedResGlb && !existsSync(cachedResGlb)) copyFileSync(sourceGlb, cachedResGlb);
      if (cachedPubGlb && !existsSync(cachedPubGlb)) copyFileSync(sourceGlb, cachedPubGlb);

      const cachedResArt = join(stage0Dir, step.inputs.art_pick_resource_pattern.replace('{pick}', String(pick)));
      const cachedPubArt = join(publicDir, step.inputs.art_pick_public_pattern.replace('{pick}', String(pick)));
      if (existsSync(cachedResArt)) copyFileSync(cachedResArt, join(stage0Dir, step.inputs.art_resource));
      if (existsSync(cachedPubArt)) copyFileSync(cachedPubArt, join(publicDir, step.inputs.art_public));

      const cacheMsg = step.messages.cache_hit.replace('{pick}', String(pick));
      console.log(`  \x1b[32m${cacheMsg}\x1b[0m\n`);

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

    const inputPath = this.findInputArt(modelName, step);
    const params = step.parameters;
    const runner = step.runner;
    const config = PipelineConfigLoader.load();
    const usdPerSec = config.pricing.runpod_trellis_usd_per_sec !== undefined ? Number(config.pricing.runpod_trellis_usd_per_sec) : 0.00016;

    if (existsSync(outputPath)) unlinkSync(outputPath);

    const envKey = step.serverless.env_endpoint_key ? step.serverless.env_endpoint_key : 'RUNPOD_TRELLIS_ENDPOINT_ID';
    const endpointId = RunPodClient.getEndpointId(envKey);
    const seed = params.seed;
    const simplify = params.simplify;
    const textureSize = params.texture_size;

    const imageBuffer = readFileSync(inputPath);
    const imageBase64 = imageBuffer.toString('base64');

    const payload = {
      image_base64: imageBase64,
      seed,
      simplify,
      texture_size: textureSize,
    };

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);

    const result = await RunPodClient.execute<typeof payload, { glb_base64: string; file_size: number }>(
      endpointId,
      payload,
      {
        onProgress: (elapsed) => {
          const progressMsg = step.messages.progress
            .replace('{runner}', runner.platform)
            .replace('{device}', runner.device)
            .replace('{elapsed}', String(elapsed));
          process.stdout.write(`\r  \x1b[36m${progressMsg}\x1b[0m`);
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

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: contract.status,
      seconds: duration,
      costUsd,
      costNote: contract.costNote,
      metrics: { fileSize: buffer.length },
      data: {
        fileSize: buffer.length,
        format: contract.data.format,
        chosenPick: pick,
        cached: false,
        device: contract.data.device,
        parameters: { seed, simplify, texture_size: textureSize },
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
