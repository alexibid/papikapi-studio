/**
 * Proves both RunPod workers honour the seed the pipeline sends and FLUX applies the style LoRA (four short jobs,
 * a few cents): FLUX with the LoRA twice (echoed seeds, different sheets), again without the LoRA on the first
 * seeds (a different sheet), TRELLIS once (echoed seed).
 * QA only reads: nothing is written to disk, the verdict is printed.
 *
 * tsx scripts/runpod/check-seeds.ts [trellis-input.png]
 */
import { createHash, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { RunPodClient } from '../common/runpod-client.js';
import { RunPodStreamClient } from '../common/runpod-stream-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type { AlternativesStepDefinition, FluxWorkerOutput } from '../stage-1/stage-1.interface.js';
import { AlternativesGenerator } from '../stage-1/step-1-alternatives.js';
import type { TrellisStepDefinition, TrellisStreamChunk } from '../stage-2/interfaces/trellis.interface.js';

const MAX_SEED = 2 ** 31 - 1;
const SUBJECT = 'a cute red fox with a white chest and a bushy tail';

function seeds(count: number): number[] {
  return Array.from({ length: count }, () => randomInt(0, MAX_SEED));
}

function fail(message: string): never {
  throw new Error(`SEEDS CHECK FAILED: ${message}`);
}

type LoraUse = 'with-lora' | 'without-lora';

async function fluxSheet(label: string, sent: readonly number[], lora: LoraUse): Promise<string> {
  const step = PipelineConfigLoader.getStep('s1-step-1') as unknown as AlternativesStepDefinition;
  const endpoint = RunPodClient.getEndpointId(step.serverless?.env_endpoint_key ?? 'RUNPOD_FLUX_ENDPOINT_ID');
  const prompt = AlternativesGenerator.composePrompt(SUBJECT, 0);
  const result = await RunPodClient.execute<Record<string, unknown>, FluxWorkerOutput>(endpoint, {
    seeds: sent, prompt, cell_prompts: sent.map(() => prompt), reference_images: [], use_lora: lora === 'with-lora',
    columns: step.parameters.columns, rows: step.parameters.rows,
  }, { timeoutMs: (step.serverless?.client_timeout_seconds ?? 900) * 1000, purgeBeforeRun: true, maxRetries: 0 });
  const echoed = result.output.seeds ?? [];
  if (echoed.join() !== sent.join()) fail(`FLUX ${label} used [${echoed.join()}] instead of [${sent.join()}]`);
  if ((lora === 'with-lora') !== Boolean(result.output.lora)) fail(`FLUX ${label} reported LoRA ${result.output.lora ?? 'none'}`);
  const sheet = Buffer.from(result.output.sheet_base64, 'base64');
  console.log(`FLUX ${label}: seeds echoed [${echoed.join()}], LoRA ${result.output.lora ?? 'none'}`);
  return createHash('sha256').update(sheet).digest('hex');
}

async function trellisSeed(inputPath: string): Promise<void> {
  const step = PipelineConfigLoader.getStep('s2-step-1') as unknown as TrellisStepDefinition;
  const endpoint = RunPodClient.getEndpointId(step.serverless.env_endpoint_key);
  const seed = randomInt(0, MAX_SEED);
  const { resolution, decimation_target, texture_size } = step.parameters;
  const result = await RunPodStreamClient.execute<Record<string, unknown>, TrellisStreamChunk>(endpoint, {
    image_base64: readFileSync(inputPath).toString('base64'), seed, resolution, decimation_target, texture_size,
  }, { timeoutMs: step.serverless.client_timeout_seconds * 1000, purgeBeforeRun: true });
  const reported = new Set(result.chunks.filter((chunk) => chunk.part === 'glb').map((chunk) => chunk.seed));
  if (reported.size !== 1 || !reported.has(seed)) fail(`TRELLIS used [${[...reported].join()}] instead of ${seed}`);
  console.log(`TRELLIS: seed echoed ${seed}`);
}

async function main(): Promise<void> {
  const firstSeeds = seeds(6);
  const first = await fluxSheet('a', firstSeeds, 'with-lora');
  const second = await fluxSheet('b', seeds(6), 'with-lora');
  if (first === second) fail('FLUX returned the same sheet for different seeds');
  console.log('FLUX: different seeds give different sheets');
  const plain = await fluxSheet('a-without-lora', firstSeeds, 'without-lora');
  if (plain === first) fail('FLUX returned the same sheet with and without the LoRA');
  console.log('FLUX: the LoRA changes the sheet');
  const trellisInput = process.argv[2] ?? join(WorkspacePaths.resourcePath('darth'), 'stage-1', 'step-3-trellis-input.png');
  await trellisSeed(trellisInput);
  console.log('SEEDS CHECK PASSED');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
