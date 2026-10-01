import type { ConsoleMethod } from './interfaces/quiet-console.interface.js';

const METHODS: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error'];

export class QuietConsole {
  private static original = new Map<ConsoleMethod, (...values: unknown[]) => void>();
  private static lines: string[] = [];

  public static start(): void {
    this.lines = [];
    for (const method of METHODS) {
      this.original.set(method, console[method].bind(console));
      console[method] = (...values: unknown[]): void => {
        this.lines.push(values.map(String).join(' '));
      };
    }
  }

  public static stop(): readonly string[] {
    for (const method of METHODS) {
      const restored = this.original.get(method);
      if (restored) console[method] = restored;
    }
    this.original.clear();
    return this.lines;
  }
}
