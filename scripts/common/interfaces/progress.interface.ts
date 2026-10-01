export type ProgressState = 'running' | 'done' | 'failed';

export interface StageSummary {
  readonly stepId: string;
  readonly message: string;
}

export interface ProgressEvent {
  readonly stepId: string;
  readonly message: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly expectedSeconds: number;
  readonly elapsedInStepMs: number;
  readonly state: ProgressState;
  readonly stages: readonly StageSummary[];
}

export type ProgressListener = (event: ProgressEvent) => void;

export interface ProgressJob {
  readonly stepIds: readonly string[];
  readonly messages: Map<string, string>;
  stepId: string;
  message: string;
  stepStartedAt: number;
  state: ProgressState;
}
