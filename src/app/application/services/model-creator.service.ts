import { Injectable, signal } from '@angular/core';

export interface AlternativesResponse {
  readonly success: boolean;
  readonly name: string;
  readonly prompt: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
}

export interface PickResponse {
  readonly success: boolean;
  readonly name: string;
  readonly artPath: string;
  readonly modelPath: string;
  readonly cached?: boolean;
  readonly pick?: number;
}

export interface Active3DGeneration {
  readonly modelName: string;
  readonly pick: number;
  readonly startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ModelCreatorService {
  private readonly baseUrl = this.resolveApiBase();

  readonly isGenerating = signal<boolean>(false);
  readonly isPicking = signal<boolean>(false);
  readonly statusMessage = signal<string>('');
  readonly error = signal<string>('');
  readonly currentSheet = signal<string | null>(null);
  readonly currentName = signal<string>('');
  readonly cachedPicks = signal<readonly number[]>([]);
  readonly currentPick = signal<number | null>(null);
  readonly activeGenerations = signal<Record<string, Active3DGeneration>>(this.loadInitialGenerations());

  getGeneration(name: string): Active3DGeneration | null {
    return this.activeGenerations()[name] ?? null;
  }

  isGenerating3d(name: string): boolean {
    return Boolean(this.activeGenerations()[name]);
  }

  private loadInitialGenerations(): Record<string, Active3DGeneration> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('papikapi_active_generations');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Active3DGeneration>;
      const valid: Record<string, Active3DGeneration> = {};
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed)) {
        if (now - v.startedAt < 120000) {
          valid[k] = v;
        }
      }
      return valid;
    } catch {
      return {};
    }
  }

  private saveGenerations(gens: Record<string, Active3DGeneration>): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('papikapi_active_generations', JSON.stringify(gens));
    } catch {}
  }

  private resolveApiBase(): string {
    if (typeof window !== 'undefined' && window.location.port === '4500') {
      return 'http://localhost:4502';
    }
    return '';
  }

  async generateAlternatives(name: string, prompt: string, images: string[] = []): Promise<AlternativesResponse | null> {
    this.isGenerating.set(true);
    this.error.set('');
    this.statusMessage.set('generatingAlternatives');
    this.currentSheet.set(null);
    this.currentName.set(name);

    try {
      const response = await fetch(`${this.baseUrl}/api/creator/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt, images }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const result: AlternativesResponse = await response.json();
      const sheetUrl = `${this.baseUrl}/api/creator/sheet?name=${encodeURIComponent(result.name)}&t=${Date.now()}`;
      this.currentSheet.set(sheetUrl);
      this.statusMessage.set('alternativesReady');
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.error.set(msg);
      this.statusMessage.set('');
      return null;
    } finally {
      this.isGenerating.set(false);
    }
  }

  async loadExistingAlternatives(name: string): Promise<boolean> {
    this.error.set('');
    this.currentName.set(name);

    try {
      const res = await fetch(`${this.baseUrl}/api/creator/info?name=${encodeURIComponent(name)}`);
      if (!res.ok) return false;
      const data = (await res.json()) as {
        hasAlternatives?: boolean;
        cachedPicks?: number[];
        currentPick?: number | null;
      };

      if (data.cachedPicks) {
        this.cachedPicks.set(data.cachedPicks);
      }
      if (data.currentPick !== undefined) {
        this.currentPick.set(data.currentPick);
      }

      if (data.hasAlternatives) {
        const sheetUrl = `${this.baseUrl}/api/creator/sheet?name=${encodeURIComponent(name)}&t=${Date.now()}`;
        this.currentSheet.set(sheetUrl);
        this.statusMessage.set('alternativesReady');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async deleteModel(name: string): Promise<boolean> {
    this.error.set('');

    try {
      const response = await fetch(`${this.baseUrl}/api/creator/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({ error: 'Delete failed' }))) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.error.set(msg);
      return false;
    }
  }

  async pickAlternative(name: string, pick: number, isCached = false): Promise<PickResponse | null> {
    const cached = isCached || this.cachedPicks().includes(pick);
    if (!cached) {
      this.activeGenerations.update((prev) => {
        const next = {
          ...prev,
          [name]: {
            modelName: name,
            pick,
            startedAt: Date.now(),
          },
        };
        this.saveGenerations(next);
        return next;
      });
    }
    this.isPicking.set(true);
    this.error.set('');
    this.statusMessage.set('generating3dModel');

    try {
      const response = await fetch(`${this.baseUrl}/api/creator/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pick }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Pick request failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const result: PickResponse = await response.json();
      this.currentPick.set(pick);
      if (!this.cachedPicks().includes(pick)) {
        this.cachedPicks.update((prev) => [...prev, pick].sort((a, b) => a - b));
      }
      this.statusMessage.set('modelReady');
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.error.set(msg);
      return null;
    } finally {
      this.isPicking.set(false);
      this.activeGenerations.update((prev) => {
        const next = { ...prev };
        delete next[name];
        this.saveGenerations(next);
        return next;
      });
    }
  }

  reset(): void {
    this.isGenerating.set(false);
    this.isPicking.set(false);
    this.statusMessage.set('');
    this.error.set('');
    this.currentSheet.set(null);
    this.currentName.set('');
    this.cachedPicks.set([]);
    this.currentPick.set(null);
  }
}
