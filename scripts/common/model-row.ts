import type { CellStatus } from './interfaces/model-row.interface.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CLEAR_LINE = '\r\x1b[2K';
const LABEL_WIDTH = 28;

export class ModelRow {
  private readonly cells: string[] = [];

  constructor(
    private readonly label: string,
    private readonly interactive: boolean = process.stdout.isTTY === true,
  ) {}

  public begin(): void {
    this.draw('');
  }

  public running(stepLabel: string): void {
    this.draw(`${DIM}⟳ ${stepLabel}${RESET}`);
  }

  public finish(stepLabel: string, status: CellStatus, seconds: number): void {
    this.cells.push(this.cell(stepLabel, status, seconds));
    this.draw('');
  }

  public end(totalSeconds: number, passed: boolean, failure: readonly string[]): void {
    const verdict = passed ? `${GREEN}OK${RESET}` : `${RED}FAIL${RESET}`;
    const line = `${this.prefix()}${this.cells.join(' │ ')} │ ${totalSeconds.toFixed(1)}s ${verdict}`;
    process.stdout.write(this.interactive ? `${CLEAR_LINE}${line}\n` : `${line}\n`);
    failure.forEach((message) => process.stdout.write(`    ${message}\n`));
  }

  private prefix(): string {
    return `${this.label.padEnd(LABEL_WIDTH, ' ')} `;
  }

  private cell(stepLabel: string, status: CellStatus, seconds: number): string {
    if (status === 'SKIP') return `${YELLOW}⏭ ${stepLabel}${RESET}`;
    const mark = status === 'DONE' ? `${GREEN}✔${RESET}` : `${RED}✖${RESET}`;
    return `${mark} ${stepLabel} ${seconds.toFixed(1)}s`;
  }

  private draw(trailing: string): void {
    if (!this.interactive) return;
    const done = this.cells.join(' │ ');
    const separator = done && trailing ? ' │ ' : '';
    process.stdout.write(`${CLEAR_LINE}${this.prefix()}${done}${separator}${trailing}`);
  }
}
