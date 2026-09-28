import type { CreationProgress } from '../../../application/services/creation-progress.service';
import { ReceiptStages } from './receipt-stages';

describe('ReceiptStages', () => {
  const progress: CreationProgress = {
    stepId: 's1-step-1',
    message: 'Creating transparent cutout for lion',
    stepIndex: 1,
    stepCount: 3,
    expectedSeconds: 2,
    elapsedInStepMs: 400,
    state: 'running',
    stages: [
      { stepId: 's0-step-2', message: 'Alternative #3 cropped in 0.2s' },
      { stepId: 's1-step-1', message: 'Creating transparent cutout for lion' },
    ],
  };

  it('should mark every stage before the current one as done with its last message', () => {
    const stages = ReceiptStages.fromProgress(progress);
    expect(stages.map((stage) => stage.isDone)).toEqual([true, false]);
    expect(stages[0].message).toBe('Alternative #3 cropped in 0.2s');
    expect(stages[0].titleKey).toBe('loaderStagePick');
  });

  it('should mark every stage as done once the process finishes', () => {
    const stages = ReceiptStages.fromProgress({ ...progress, state: 'done' });
    expect(stages.every((stage) => stage.isDone)).toBe(true);
  });

  it('should unfold local timeline stages when no server progress exists', () => {
    const stages = ReceiptStages.fromTimeline('3d', 9);
    expect(stages.map((stage) => stage.titleKey)).toEqual([
      'loaderStepCrop',
      'loaderStepGpu',
      'loaderStepVoxel',
    ]);
    expect(stages.map((stage) => stage.isDone)).toEqual([true, true, false]);
  });
});
