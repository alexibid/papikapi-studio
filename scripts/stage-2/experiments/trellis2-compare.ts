import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunPodClient } from '../../common/runpod-client.js';
import { RunPodStreamClient } from '../../common/runpod-stream-client.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';
import type { TrellisStreamChunk, TrellisStreamPart } from '../interfaces/trellis.interface.js';

/**
 * Runs one image through the TRELLIS.2 worker with an explicit seed, to compare it with the official Space.
 * npx tsx scripts/stage-2/experiments/trellis2-compare.ts <model> <input.png relative to resources/<model>> <seed>
 */
const DECIMATION_TARGET = 500_000;
const TEXTURE_SIZE = 2048;
const RESOLUTION = '1024';
const TIMEOUT_MS = 1_800_000;

function assemble(chunks: readonly TrellisStreamChunk[], part: TrellisStreamPart): Buffer {
  const failure = chunks.find((chunk) => chunk.error);
  if (failure) {
    throw new Error(failure.error);
  }
  const pieces = chunks.filter((chunk) => chunk.part === part).sort((left, right) => left.chunk_index - right.chunk_index);
  return Buffer.from(pieces.map((chunk) => chunk.data).join(''), 'base64');
}

async function compare(modelName: string, inputPath: string, seed: number): Promise<void> {
  const resources = WorkspacePaths.resourcePath(modelName);
  const payload = {
    image_base64: readFileSync(join(resources, inputPath)).toString('base64'),
    seed,
    resolution: RESOLUTION,
    decimation_target: DECIMATION_TARGET,
    texture_size: TEXTURE_SIZE,
  };
  const endpointId = RunPodClient.getEndpointId('RUNPOD_TRELLIS_ENDPOINT_ID');
  const result = await RunPodStreamClient.execute<typeof payload, TrellisStreamChunk>(endpointId, payload, {
    timeoutMs: TIMEOUT_MS,
    purgeBeforeRun: true,
    onProgress: (update) => process.stdout.write(`\r  ${update.status} ${update.elapsedSeconds}s`),
  });
  const stem = join(resources, 'stage-2', `step-2-compare-seed-${seed}`);
  writeFileSync(`${stem}-preview.png`, assemble(result.chunks, 'preview'));
  writeFileSync(`${stem}.glb`, assemble(result.chunks, 'glb'));
  console.log(`\n  ${stem}-preview.png (${result.seconds}s)`);
}

const [modelName = 'darth', inputPath = 'stage-1/step-3-trellis-input.png', seed = '1'] = process.argv.slice(2);
await compare(modelName, inputPath, Number(seed));
