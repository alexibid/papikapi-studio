import type { ModelExecutionReport } from './interfaces/index.js';

export class StageReporter {
  public static printHeader(stageTitle: string, modelCount: number): void {
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║                  P A P I K A P I   S T U D I O                  ║');
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
    const failed = reports.filter((report) => !report.passed).length;
    const skipped = reports.reduce((total, report) => total + report.stepResults.filter((step) => step.status === 'SKIP').length, 0);
    const totals = `${reports.length} models, ${reports.length - failed} OK, ${failed} failed, ${skipped} steps skipped`;
    console.log(failed === 0 ? `\n0 INCIDENTS: ${totals}\n` : `\n❌ Execution finished with errors: ${totals}\n`);
  }
}
