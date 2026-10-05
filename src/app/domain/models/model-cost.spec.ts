import { NO_COST, formatUsd, readModelCost } from './model-cost';

describe('readModelCost', () => {
  it('reads the total and only the stages that cost money', () => {
    const cost = readModelCost({
      totalCostUsd: 0.0446,
      stages: {
        a: { stageId: 's1-step-1', costUsd: 0.0072, costNote: 'FLUX' },
        b: { stageId: 's1-step-2', costUsd: 0 },
      },
    });
    expect(cost.totalUsd).toBe(0.0446);
    expect(cost.stages).toEqual([{ stageId: 's1-step-1', costUsd: 0.0072, note: 'FLUX' }]);
  });

  it('returns no cost for an invalid payload', () => {
    expect(readModelCost(null)).toBe(NO_COST);
    expect(readModelCost({ totalCostUsd: 'x', stages: 3 })).toEqual({ totalUsd: 0, stages: [] });
  });

  it('formats dollars with four decimals', () => {
    expect(formatUsd(0.0446)).toBe('$0.0446');
  });
});
