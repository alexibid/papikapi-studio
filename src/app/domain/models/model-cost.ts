export interface StageCost {
  readonly stageId: string;
  readonly costUsd: number;
  readonly note: string;
}

export interface ModelCost {
  readonly totalUsd: number;
  readonly stages: readonly StageCost[];
}

interface RawStage {
  readonly stageId?: unknown;
  readonly costUsd?: unknown;
  readonly costNote?: unknown;
}

interface RawManifest {
  readonly totalCostUsd?: unknown;
  readonly stages?: unknown;
}

export const NO_COST: ModelCost = { totalUsd: 0, stages: [] };

export function readModelCost(payload: unknown): ModelCost {
  if (typeof payload !== 'object' || payload === null) {
    return NO_COST;
  }
  const manifest = payload as RawManifest;
  const stages = readStages(manifest.stages);
  return { totalUsd: number(manifest.totalCostUsd), stages };
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function readStages(value: unknown): readonly StageCost[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.values(value as Record<string, RawStage>)
    .filter((stage) => typeof stage?.stageId === 'string' && number(stage.costUsd) > 0)
    .map((stage) => ({
      stageId: String(stage.stageId),
      costUsd: number(stage.costUsd),
      note: typeof stage.costNote === 'string' ? stage.costNote : '',
    }));
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
