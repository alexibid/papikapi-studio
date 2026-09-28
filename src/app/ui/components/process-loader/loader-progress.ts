export interface StepProgress {
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly expectedSeconds: number;
  readonly elapsedSeconds: number;
}

export class LoaderProgress {
  private static readonly LINEAR_CEILING = 90;
  private static readonly ASYMPTOTE = 99.9;

  static percentAt(elapsedSeconds: number, expectedSeconds: number): number {
    const ratio = elapsedSeconds / Math.max(1, expectedSeconds);
    if (ratio <= 1) {
      return LoaderProgress.LINEAR_CEILING * ratio;
    }
    const remaining = LoaderProgress.ASYMPTOTE - LoaderProgress.LINEAR_CEILING;
    return LoaderProgress.LINEAR_CEILING + remaining * (1 - Math.exp(1 - ratio));
  }

  static percentAcrossSteps(step: StepProgress): number {
    const withinStep = LoaderProgress.percentAt(step.elapsedSeconds, step.expectedSeconds) / 100;
    return ((step.stepIndex + withinStep) / Math.max(1, step.stepCount)) * 100;
  }

  static format(percent: number): string {
    const digits = percent < LoaderProgress.LINEAR_CEILING ? 0 : 1;
    const factor = 10 ** digits;
    return `${(Math.floor(percent * factor) / factor).toFixed(digits)}%`;
  }
}
