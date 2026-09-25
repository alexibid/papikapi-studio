export interface StepRecordInput {
  readonly status: string;
  readonly seconds: number;
  readonly costUsd: number;
  readonly at?: string;
  readonly costNote?: string;
  readonly data?: Record<string, unknown>;
  readonly metrics?: Record<string, unknown>;
}

export interface StepRecord extends StepRecordInput {
  readonly stageId: string;
}

export interface ModelManifest {
  readonly version: number;
  readonly subject: string;
  readonly stages: Record<string, StepRecord>;
  readonly totalSeconds: number;
  readonly totalCostUsd: number;
  readonly updatedAt: string;
}
