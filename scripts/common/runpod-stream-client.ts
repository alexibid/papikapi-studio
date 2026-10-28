import type {
  RunPodApiResponse,
  RunPodExecuteOptions,
  RunPodStreamResponse,
  RunPodStreamResult,
} from './interfaces/index.js';
import { RunPodClient } from './runpod-client.js';

const API_ROOT = 'https://api.runpod.ai/v2';
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 1_200_000;
const FINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);

/**
 * Runs a generator handler and collects every streamed chunk from /stream.
 * Used for results above RunPod's ~20 MB job result cap, which a single return value cannot carry.
 */
export class RunPodStreamClient {
  public static async execute<TInput extends Record<string, unknown>, TChunk>(
    endpointId: string,
    input: TInput,
    options?: RunPodExecuteOptions,
  ): Promise<RunPodStreamResult<TChunk>> {
    if (options?.purgeBeforeRun) {
      await RunPodClient.purgeQueue(endpointId);
    }
    const startTime = Date.now();
    const jobId = await this.submit(endpointId.trim(), input);
    const chunks = await this.collect<TChunk>(endpointId.trim(), jobId, startTime, options);
    return { chunks, seconds: Math.round((Date.now() - startTime) / 10) / 100 };
  }

  private static async submit(endpointId: string, input: Record<string, unknown>): Promise<string> {
    const response = await fetch(`${API_ROOT}/${endpointId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RunPodClient.getApiKey()}` },
      body: JSON.stringify({ input }),
    });
    if (!response.ok) {
      throw new Error(`RunPod run error (${response.status}): ${await response.text()}`);
    }
    return ((await response.json()) as RunPodApiResponse<unknown>).id;
  }

  private static async collect<TChunk>(
    endpointId: string,
    jobId: string,
    startTime: number,
    options?: RunPodExecuteOptions,
  ): Promise<TChunk[]> {
    const chunks: TChunk[] = [];
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
      const poll = await this.poll<TChunk>(endpointId, jobId);
      chunks.push(...(poll.stream ?? []).map((item) => item.output));
      options?.onProgress?.({ elapsedSeconds: Math.round((Date.now() - startTime) / 1000), status: poll.status });
      if (poll.status === 'FAILED' || poll.error) {
        throw new Error(`RunPod stream job ${jobId} failed: ${poll.error ?? 'no error message'}`);
      }
      if (FINAL_STATUSES.has(poll.status)) {
        return this.assertSucceeded(poll, jobId, chunks);
      }
    }
    await fetch(`${API_ROOT}/${endpointId}/cancel/${jobId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RunPodClient.getApiKey()}` },
    });
    throw new Error(`RunPod stream job ${jobId} timed out after ${timeout / 1000}s`);
  }

  private static async poll<TChunk>(endpointId: string, jobId: string): Promise<RunPodStreamResponse<TChunk>> {
    const response = await fetch(`${API_ROOT}/${endpointId}/stream/${jobId}`, {
      headers: { Authorization: `Bearer ${RunPodClient.getApiKey()}` },
    });
    if (!response.ok) {
      return { status: 'IN_PROGRESS' };
    }
    return (await response.json()) as RunPodStreamResponse<TChunk>;
  }

  private static assertSucceeded<TChunk>(
    poll: RunPodStreamResponse<TChunk>,
    jobId: string,
    chunks: TChunk[],
  ): TChunk[] {
    if (poll.status !== 'COMPLETED') {
      throw new Error(`RunPod stream job ${jobId} ended with status ${poll.status}`);
    }
    if (chunks.length === 0) {
      throw new Error(`RunPod stream job ${jobId} completed without any streamed chunk`);
    }
    return chunks;
  }
}
