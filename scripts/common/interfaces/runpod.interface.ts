export interface RunPodJobResult<T> {
  readonly output: T;
  readonly seconds: number;
}

export interface RunPodExecuteOptions {
  readonly onProgress?: (elapsedSeconds: number) => void;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

export interface RunPodApiResponse<T> {
  readonly id: string;
  readonly status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  readonly output?: T;
  readonly error?: string;
  readonly executionTime?: number;
}
