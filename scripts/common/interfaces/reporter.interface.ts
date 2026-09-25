export interface StepExecutionResult {
  readonly stepId: string;
  readonly label: string;
  readonly status: 'DONE' | 'FAIL' | 'SKIP';
  readonly duration: number;
  readonly message?: string;
}

export interface ModelExecutionReport {
  readonly modelName: string;
  readonly stepResults: readonly StepExecutionResult[];
  readonly totalDuration: number;
  readonly passed: boolean;
}
