export type ProcessLoaderMode = 'alternatives' | '3d';

export interface FallbackStep {
  readonly titleKey: string;
  readonly startsAtSecond: number;
}

export const STAGE_TITLE_KEYS: Readonly<Record<string, string>> = {
  's1-step-1': 'loaderStageAlternatives',
  's1-step-2': 'loaderStagePick',
  's2-step-1': 'loaderStageCutout',
  's2-step-2': 'loaderStageMesh',
};

export const EXPECTED_SECONDS: Readonly<Record<ProcessLoaderMode, number>> = {
  '3d': 28,
  alternatives: 20,
};

export const FALLBACK_STEPS: Readonly<Record<ProcessLoaderMode, readonly FallbackStep[]>> = {
  '3d': [
    { titleKey: 'loaderStepCrop', startsAtSecond: 0 },
    { titleKey: 'loaderStepGpu', startsAtSecond: 3 },
    { titleKey: 'loaderStepVoxel', startsAtSecond: 8 },
    { titleKey: 'loaderStepMesh', startsAtSecond: 15 },
    { titleKey: 'loaderStepFinalize', startsAtSecond: 21 },
  ],
  alternatives: [
    { titleKey: 'loaderStepAltPrompt', startsAtSecond: 0 },
    { titleKey: 'loaderStepAltStyle', startsAtSecond: 3 },
    { titleKey: 'loaderStepAltSynth', startsAtSecond: 7 },
    { titleKey: 'loaderStepAltPrep', startsAtSecond: 13 },
  ],
};
