import { Injectable, signal } from '@angular/core';
import { LabRun } from '../../domain/models/lab-run';

const RUNS_URL = '/assets/lab/runs.json';

export type LabLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

@Injectable({ providedIn: 'root' })
export class LabRunsService {
  readonly runs = signal<readonly LabRun[]>([]);
  readonly state = signal<LabLoadState>('idle');
  readonly problem = signal<string | null>(null);

  async load(): Promise<void> {
    this.state.set('loading');
    this.problem.set(null);

    try {
      const runs = await this.fetchRuns();
      this.runs.set(runs);
      this.state.set(runs.length === 0 ? 'empty' : 'ready');
    } catch (err) {
      this.runs.set([]);
      this.problem.set(err instanceof Error ? err.message : String(err));
      this.state.set('error');
    }
  }

  private async fetchRuns(): Promise<readonly LabRun[]> {
    const response = await fetch(RUNS_URL);
    if (!response.ok) {
      throw new Error(`No runs recorded (HTTP ${response.status}).`);
    }

    const body = await response.text();
    if (body.trimStart().startsWith('<')) {
      throw new Error(
        'The dev server returned HTML instead of JSON. Restart it so it serves src/assets.'
      );
    }

    const parsed: unknown = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      throw new Error('runs.json does not contain a list of runs.');
    }
    return parsed as readonly LabRun[];
  }
}
