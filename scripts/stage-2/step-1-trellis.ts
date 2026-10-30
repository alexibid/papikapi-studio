import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { RunPodClient } from '../common/runpod-client.js';
import { RunPodStreamClient } from '../common/runpod-stream-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  TrellisGenerateResponse,
  TrellisStreamChunk,
  TrellisStreamPart,
  TrellisStepDefinition,
} from './interfaces/trellis.interface.js';

export class TrellisGenerator {
  private static readonly stepId = 's2-step-1';

  private static findTrellisInput(modelName: string, step: TrellisStepDefinition): string {
    const inputPath = join(
      WorkspacePaths.resourcePath(modelName),
      step.inputs.stage_dir,
      step.inputs.trellis_input_resource,
    );
    if (!existsSync(inputPath)) {
      throw new Error(`TRELLIS input not found for '${modelName}': run s1-step-3 first (${inputPath})`);
    }
    return inputPath;
  }

  private static readonly maxSeed = 2_147_483_647;

  /** Same as the official Space's "Randomize Seed": a fresh seed per run, kept in the manifest to reproduce it. */
  private static resolveSeed(seed: number | 'random'): number {
    return seed === 'random' ? randomInt(0, this.maxSeed) : seed;
  }

  /** A worker that does not report the seed it ran cannot be trusted to have used the random one. */
  private static assertSeedUsed(chunks: readonly TrellisStreamChunk[], seed: number): void {
    const reported = new Set(chunks.filter((chunk) => chunk.part === 'glb').map((chunk) => chunk.seed));
    if (reported.size !== 1 || !reported.has(seed)) {
      throw new Error(`TRELLIS worker used seed [${[...reported].join()}] instead of ${seed}`);
    }
  }

  private static assemblePart(chunks: readonly TrellisStreamChunk[], part: TrellisStreamPart): Buffer {
    const failure = chunks.find((chunk) => chunk.error);
    if (failure) {
      throw new Error(failure.error);
    }
    const pieces = chunks.filter((chunk) => chunk.part === part).sort((left, right) => left.chunk_index - right.chunk_index);
    if (pieces.length === 0 || pieces.length !== pieces[0].chunk_count) {
      throw new Error(`${part} stream incomplete: received ${pieces.length} of ${pieces[0]?.chunk_count ?? '?'} chunks`);
    }
    const buffer = Buffer.from(pieces.map((chunk) => chunk.data).join(''), 'base64');
    if (buffer.length !== pieces[0].file_size) {
      throw new Error(`${part} stream corrupted: ${buffer.length} bytes instead of ${pieces[0].file_size}`);
    }
    return buffer;
  }

  public static async execute(modelName: string, requestedPick?: number): Promise<TrellisGenerateResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TrellisStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
    const pick = requestedPick ?? ManifestManager.readStepResult(modelName, 's1-step-2')?.data?.chosenPick;

    const contract = step.manifest_contract;
    const outputPath = join(stageDir, step.outputs.model_resource);
    const inputPath = this.findTrellisInput(modelName, step);
    const params = step.parameters;
    const runner = step.runner;
    const config = PipelineConfigLoader.load();
    const usdPerSec = Number(config.pricing.runpod_trellis_usd_per_sec);

    if (existsSync(outputPath)) unlinkSync(outputPath);

    const envKey = step.serverless.env_endpoint_key
      ? step.serverless.env_endpoint_key
      : 'RUNPOD_TRELLIS_ENDPOINT_ID';
    const endpointId = RunPodClient.getEndpointId(envKey);
    const settings = {
      seed: this.resolveSeed(params.seed),
      resolution: params.resolution,
      decimation_target: params.decimation_target,
      texture_size: params.texture_size,
    };
    const payload = { image_base64: readFileSync(inputPath).toString('base64'), ...settings };

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    let buffer: Buffer;
    let duration: number;
    let costUsd: number;
    let faceCount = 0;

    try {
      const result = await RunPodStreamClient.execute<typeof payload, TrellisStreamChunk>(endpointId, payload, {
        timeoutMs: step.serverless.client_timeout_seconds * 1000,
        purgeBeforeRun: true,
        onProgress: (update) => {
          const runnerState = update.status === 'IN_QUEUE' ? 'Na fila de espera' : runner.device;
          const progressMsg = step.messages.progress
            .replace('{runner}', runner.platform)
            .replace('{device}', runnerState)
            .replace('{elapsed}', String(update.elapsedSeconds));
          process.stdout.write(`\r  \x1b[36m${progressMsg}\x1b[0m`);
          ProgressHub.report(modelName, this.stepId, progressMsg);
        },
      });
      process.stdout.write('\r\x1b[K');

      buffer = this.assemblePart(result.chunks, 'glb');
      writeFileSync(join(stageDir, step.outputs.preview_resource), this.assemblePart(result.chunks, 'preview'));
      duration = result.seconds;
      costUsd = Math.round(duration * usdPerSec * 10000) / 10000;
      faceCount = result.chunks.find((chunk) => chunk.part === 'glb')?.face_count ?? 0;
      this.assertSeedUsed(result.chunks, settings.seed);
    } catch (trellisErr) {
      process.stdout.write('\r\x1b[K');
      const errorMsg = (trellisErr as Error).message;
      console.error(`  \x1b[31m[${this.stepId}] ❌ Trellis 3D generation failed: ${errorMsg}\x1b[0m`);
      throw new Error(`Falha na geração 3D Trellis: ${errorMsg}`);
    }

    writeFileSync(outputPath, buffer);
    writeFileSync(join(publicDir, step.outputs.model_public), buffer);
    if (pick) {
      writeFileSync(join(stageDir, step.outputs.model_pick_resource_pattern.replace('{pick}', String(pick))), buffer);
      writeFileSync(join(publicDir, step.outputs.model_pick_public_pattern.replace('{pick}', String(pick))), buffer);
    }

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
      metrics: {
        fileSize: buffer.length,
        faceCount,
      },
      data: {
        fileSize: buffer.length,
        faceCount,
        format: contract.data.format,
        cached: false,
        chosenPick: pick ?? null,
        device: contract.data.device,
        parameters: settings,
      },
    });

    return {
      name: modelName,
      outputPath,
      publicPath: step.outputs.public_url_pattern.replace('{model}', modelName),
      seconds: duration,
      costUsd,
      cached: false,
    };
  }
}
