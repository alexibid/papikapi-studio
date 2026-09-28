import { PipelineConfigLoader } from './pipeline-config.js';

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

type ProgressListener = (event: ProgressEvent) => void;

interface ProgressJob {
  readonly stepIds: readonly string[];
  readonly messages: Map<string, string>;
  stepId: string;
  message: string;
  stepStartedAt: number;
  state: ProgressState;
}

export class ProgressHub {
  private static readonly jobs = new Map<string, ProgressJob>();
  private static readonly listeners = new Map<string, Set<ProgressListener>>();

  public static begin(model: string, stepIds: readonly string[]): void {
    this.jobs.set(model, {
      stepIds,
      messages: new Map<string, string>(),
      stepId: stepIds[0],
      message: '',
      stepStartedAt: Date.now(),
      state: 'running',
    });
    this.broadcast(model);
  }

  public static report(model: string, stepId: string, message: string): void {
    const job = this.jobs.get(model);
    if (!job || !job.stepIds.includes(stepId)) return;
    if (job.stepId !== stepId) {
      job.stepId = stepId;
      job.stepStartedAt = Date.now();
    }
    job.message = message;
    job.messages.set(stepId, message);
    this.broadcast(model);
  }

  public static finish(model: string): void {
    this.settle(model, 'done');
  }

  public static fail(model: string, message: string): void {
    const job = this.jobs.get(model);
    if (job) job.message = message;
    this.settle(model, 'failed');
  }

  public static subscribe(model: string, listener: ProgressListener): () => void {
    const modelListeners = this.listeners.get(model) ?? new Set<ProgressListener>();
    modelListeners.add(listener);
    this.listeners.set(model, modelListeners);
    const job = this.jobs.get(model);
    if (job) listener(this.toEvent(job));
    return () => modelListeners.delete(listener);
  }

  private static settle(model: string, state: Exclude<ProgressState, 'running'>): void {
    const job = this.jobs.get(model);
    if (!job) return;
    job.state = state;
    this.broadcast(model);
    this.jobs.delete(model);
  }

  private static broadcast(model: string): void {
    const job = this.jobs.get(model);
    if (!job) return;
    const event = this.toEvent(job);
    this.listeners.get(model)?.forEach((listener) => listener(event));
  }

  private static toEvent(job: ProgressJob): ProgressEvent {
    const stepIndex = job.stepIds.indexOf(job.stepId);
    return {
      stepId: job.stepId,
      message: job.message,
      stepIndex,
      stepCount: job.stepIds.length,
      expectedSeconds: PipelineConfigLoader.getStep(job.stepId).expected_seconds,
      elapsedInStepMs: Date.now() - job.stepStartedAt,
      state: job.state,
      stages: job.stepIds.slice(0, stepIndex + 1).map((stepId) => ({
        stepId,
        message: job.messages.get(stepId) ?? '',
      })),
    };
  }
}
