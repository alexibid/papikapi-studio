import { Injectable } from '@angular/core';

const PROGRESS_STATES = ['running', 'done', 'failed'] as const;

export type CreationProgressState = (typeof PROGRESS_STATES)[number];

export interface CreationStageSummary {
  readonly stepId: string;
  readonly message: string;
}

export interface CreationProgress {
  readonly stepId: string;
  readonly message: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly expectedSeconds: number;
  readonly elapsedInStepMs: number;
  readonly state: CreationProgressState;
  readonly stages: readonly CreationStageSummary[];
}

export type CreationProgressListener = (progress: CreationProgress) => void;

const API_PORT_BY_DEV_PORT: Readonly<Record<string, string>> = { '4500': 'http://localhost:4502' };

@Injectable({ providedIn: 'root' })
export class CreationProgressService {
  private readonly baseUrl = API_PORT_BY_DEV_PORT[globalThis.location?.port ?? ''] ?? '';

  connect(modelName: string, listener: CreationProgressListener): () => void {
    const url = `${this.baseUrl}/api/creator/progress?name=${encodeURIComponent(modelName)}`;
    const source = new EventSource(url);
    source.onmessage = (message: MessageEvent<string>) => {
      const payload: unknown = JSON.parse(message.data);
      if (isCreationProgress(payload)) {
        listener(payload);
      }
    };
    return () => source.close();
  }
}

function isCreationProgress(value: unknown): value is CreationProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stepId' in value &&
    typeof value.stepId === 'string' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'stepIndex' in value &&
    typeof value.stepIndex === 'number' &&
    'stepCount' in value &&
    typeof value.stepCount === 'number' &&
    'expectedSeconds' in value &&
    typeof value.expectedSeconds === 'number' &&
    'elapsedInStepMs' in value &&
    typeof value.elapsedInStepMs === 'number' &&
    'state' in value &&
    typeof value.state === 'string' &&
    PROGRESS_STATES.some((state) => state === value.state) &&
    'stages' in value &&
    Array.isArray(value.stages) &&
    value.stages.every(isStageSummary)
  );
}

function isStageSummary(value: unknown): value is CreationStageSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    'stepId' in value &&
    typeof value.stepId === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}
