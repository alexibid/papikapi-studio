import type { CreationProgress } from '../../../application/services/creation-progress.service';
import { FALLBACK_STEPS, ProcessLoaderMode, STAGE_TITLE_KEYS } from './process-loader.config';

export interface ReceiptStage {
  readonly id: string;
  readonly titleKey: string;
  readonly message: string;
  readonly isDone: boolean;
}

export class ReceiptStages {
  static fromProgress(progress: CreationProgress): readonly ReceiptStage[] {
    const isFinished = progress.state === 'done';
    return progress.stages.map((stage, index) => ({
      id: stage.stepId,
      titleKey: STAGE_TITLE_KEYS[stage.stepId] ?? stage.stepId,
      message: stage.message,
      isDone: isFinished || index < progress.stepIndex,
    }));
  }

  static fromTimeline(mode: ProcessLoaderMode, elapsedSeconds: number): readonly ReceiptStage[] {
    const reached = FALLBACK_STEPS[mode].filter((step) => step.startsAtSecond <= elapsedSeconds);
    return reached.map((step, index) => ({
      id: step.titleKey,
      titleKey: step.titleKey,
      message: '',
      isDone: index < reached.length - 1,
    }));
  }
}
