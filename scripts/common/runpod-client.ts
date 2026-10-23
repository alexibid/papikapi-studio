import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunPodApiResponse, RunPodExecuteOptions, RunPodJobResult } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

export class RunPodClient {
  private static cachedApiKey: string | null = null;

  public static getApiKey(): string {
    if (this.cachedApiKey !== null) {
      return this.cachedApiKey;
    }

    const envKey = process.env.RUNPOD_API_KEY;
    if (envKey !== undefined && envKey.trim().length > 0) {
      this.cachedApiKey = envKey.trim();
      return this.cachedApiKey;
    }

    const envFile = join(WorkspacePaths.appRoot, '.env');
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('RUNPOD_API_KEY=')) {
          const val = trimmed.slice('RUNPOD_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val.length > 0) {
            this.cachedApiKey = val;
            return this.cachedApiKey;
          }
        }
      }
    }

    throw new Error('RUNPOD_API_KEY not found in environment or apps/papikapi-studio/.env');
  }

  public static getEndpointId(envKeyName: string, defaultId?: string): string {
    const envVal = process.env[envKeyName];
    if (envVal !== undefined && envVal.trim().length > 0) {
      return envVal.trim();
    }

    const envFile = join(WorkspacePaths.appRoot, '.env');
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, 'utf-8');
      const targetPrefix = `${envKeyName}=`;
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith(targetPrefix)) {
          const val = trimmed.slice(targetPrefix.length).trim().replace(/^["']|["']$/g, '');
          if (val.length > 0) {
            return val;
          }
        }
      }
    }

    if (defaultId !== undefined && defaultId.trim().length > 0) {
      return defaultId.trim();
    }

    throw new Error(`RunPod serverless endpoint ID environment variable '${envKeyName}' is missing. Please define it in apps/papikapi-studio/.env or the environment.`);
  }

  public static async purgeQueue(endpointId: string): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      const cleanEndpoint = endpointId.trim();
      const response = await fetch(`https://api.runpod.ai/v2/${cleanEndpoint}/purge-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public static async execute<TInput extends Record<string, unknown>, TOutput>(
    endpointId: string,
    input: TInput,
    options?: RunPodExecuteOptions
  ): Promise<RunPodJobResult<TOutput>> {
    const maxRetries = options?.maxRetries !== undefined ? options.maxRetries : 1;
    const maxAttempts = maxRetries + 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt === 1 && options?.purgeBeforeRun) {
          await this.purgeQueue(endpointId);
        }
        return await this.executeSingleAttempt<TInput, TOutput>(endpointId, input, options);
      } catch (err) {
        lastError = err as Error;
        console.warn(`  [RunPodClient] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);

        if (attempt < maxAttempts) {
          console.log(`  [RunPodClient] Purging endpoint queue and retrying in 2s...`);
          await this.purgeQueue(endpointId);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError ? lastError : new Error('RunPod serverless execution failed after retries');
  }

  private static async executeSingleAttempt<TInput extends Record<string, unknown>, TOutput>(
    endpointId: string,
    input: TInput,
    options?: RunPodExecuteOptions
  ): Promise<RunPodJobResult<TOutput>> {
    const apiKey = this.getApiKey();
    const cleanEndpoint = endpointId.trim();
    const runUrl = `https://api.runpod.ai/v2/${cleanEndpoint}/run`;
    const pollInterval = options?.pollIntervalMs !== undefined ? options.pollIntervalMs : 2000;
    const timeout = options?.timeoutMs !== undefined ? options.timeoutMs : 120000;

    const resolveOutput = (raw: TOutput): TOutput => {
      if (typeof raw === 'object' && raw !== null && 'output' in raw) {
        return (raw as unknown as { output: TOutput }).output;
      }
      return raw;
    };

    const startTime = Date.now();
    const initialResponse = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input }),
    });

    if (!initialResponse.ok) {
      const errText = await initialResponse.text().catch(() => 'Unknown network error');
      throw new Error(`RunPod serverless run error (${initialResponse.status}): ${errText}`);
    }

    const initialData = (await initialResponse.json()) as RunPodApiResponse<TOutput>;

    if (initialData.status === 'COMPLETED' && initialData.output !== undefined) {
      const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100;
      return {
        output: resolveOutput(initialData.output),
        seconds: duration,
      };
    }

    if (initialData.status === 'FAILED') {
      const failMsg = initialData.error !== undefined ? initialData.error : 'Job failed on serverless worker';
      throw new Error(`RunPod serverless execution failed: ${failMsg}`);
    }

    const jobId = initialData.id;
    const statusUrl = `https://api.runpod.ai/v2/${cleanEndpoint}/status/${jobId}`;

    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

      const pollRes = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!pollRes.ok) {
        if (options?.onProgress !== undefined) {
          options.onProgress({ elapsedSeconds, status: 'IN_QUEUE' });
        }
        continue;
      }

      const pollData = (await pollRes.json()) as RunPodApiResponse<TOutput>;

      if (pollData.status === 'COMPLETED' && pollData.output !== undefined) {
        const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100;
        return {
          output: resolveOutput(pollData.output),
          seconds: duration,
        };
      }

      if (options?.onProgress !== undefined) {
        options.onProgress({ elapsedSeconds, status: pollData.status });
      }

      if (pollData.status === 'FAILED') {
        const failMsg = pollData.error !== undefined ? pollData.error : 'Job failed on serverless worker';
        throw new Error(`RunPod serverless execution failed: ${failMsg}`);
      }

      if (['CANCELLED', 'TIMED_OUT'].includes(pollData.status)) {
        throw new Error(`RunPod serverless job ended with status: ${pollData.status}`);
      }
    }

    try {
      await fetch(`https://api.runpod.ai/v2/${cleanEndpoint}/cancel/${jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      // Ignore cancellation network errors
    }

    throw new Error(`RunPod serverless job ${jobId} timed out after ${timeout / 1000}s`);
  }
}

