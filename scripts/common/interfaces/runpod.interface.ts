export type RunPodJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';

export interface RunPodJobResult<T> {
  readonly output: T;
  readonly seconds: number;
}

export interface RunPodProgressUpdate {
  readonly elapsedSeconds: number;
  readonly status: RunPodJobStatus;
}

export interface RunPodExecuteOptions {
  readonly onProgress?: (update: RunPodProgressUpdate) => void;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

export interface RunPodApiResponse<T> {
  readonly id: string;
  readonly status: RunPodJobStatus;
  readonly output?: T;
  readonly error?: string;
  readonly executionTime?: number;
}
