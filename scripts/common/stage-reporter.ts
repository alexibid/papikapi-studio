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

export class StageReporter {
  public static printHeader(stageTitle: string, modelCount: number): void {
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║                  K I R I G A M I   S T U D I O                  ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝');
    console.log(`  Stage: ${stageTitle}`);
    console.log(`  Models: ${modelCount}\n`);
  }

  public static printStepCard(label: string, status: string, duration: number): void {
    const pad = (str: string, width: number): string => str.padEnd(width, ' ');
    console.log('┌─────────┐');
    console.log(`│${pad(label, 9)}│`);
    console.log(`│  ${status.padEnd(7, ' ')}│`);
    console.log(`│${duration.toFixed(2).padStart(6, ' ')}s   │`);
    console.log('└─────────┘');
  }

  public static printSummary(reports: readonly ModelExecutionReport[]): void {
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║                     EXECUTION SUMMARY TABLE                     ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝');
    console.log(' MODEL              │ STEPS  │ TIME   │ STATUS');
    console.log('───────────────────────────────────────────────────────────────────');

    let allPassed = true;
    for (const rep of reports) {
      if (!rep.passed) allPassed = false;
      const model = rep.modelName.padEnd(18, ' ');
      const steps = `${rep.stepResults.filter((s) => s.status === 'DONE').length}/${rep.stepResults.length}`.padEnd(6, ' ');
      const time = `${rep.totalDuration.toFixed(2)}s`.padEnd(6, ' ');
      const status = rep.passed ? ' PASS ' : ' FAIL ';
      console.log(` ${model} │ ${steps} │ ${time} │ ${status}`);
    }

    console.log('───────────────────────────────────────────────────────────────────');
    if (allPassed) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' 0 INCIDENTS: All steps executed and saved files successfully.');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.log('\n❌ Execution finished with errors.\n');
    }
  }
}
