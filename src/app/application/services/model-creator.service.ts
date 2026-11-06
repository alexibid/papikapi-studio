import { Injectable, signal } from '@angular/core';
import { FigureDisplayNames } from '@ibid/utils';

export interface AlternativesRequest {
  readonly id: string;
  readonly displayName: FigureDisplayNames;
  readonly prompt: string;
  readonly images: readonly string[];
}

export interface AlternativesResponse {
  readonly success: boolean;
  readonly id: string;
  readonly prompt: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
}

export interface PickResponse {
  readonly success: boolean;
  readonly id: string;
  readonly artPath: string;
  readonly modelPath: string;
  readonly cached?: boolean;
  readonly pick?: number;
}

export interface Active3DGeneration {
  readonly figureId: string;
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
  readonly currentFigureId = signal<string>('');
  readonly cachedPicks = signal<readonly number[]>([]);
  readonly currentPick = signal<number | null>(null);
  readonly activeGenerations = signal<Record<string, Active3DGeneration>>(this.loadInitialGenerations());

  getGeneration(figureId: string): Active3DGeneration | null {
    return this.activeGenerations()[figureId] ?? null;
  }

  isGenerating3d(figureId: string): boolean {
    return Boolean(this.activeGenerations()[figureId]);
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
    if (typeof window !== 'undefined' && (window.location.port === '4500' || window.location.port === '4200')) {
      return 'http://localhost:4505';
    }
    return '';
  }

  async generateAlternatives(request: AlternativesRequest): Promise<AlternativesResponse | null> {
    this.isGenerating.set(true);
    this.error.set('');
    this.statusMessage.set('generatingAlternatives');
    this.currentSheet.set(null);
    this.currentFigureId.set(request.id);

    try {
      const response = await fetch(`${this.baseUrl}/api/creator/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const result: AlternativesResponse = await response.json();
      const figureId = result.id || request.id;
      this.currentSheet.set(this.sheetUrlOf(figureId));
      this.currentFigureId.set(figureId);
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

  async loadExistingAlternatives(figureId: string): Promise<boolean> {
    this.error.set('');
    this.currentFigureId.set(figureId);

    try {
      const res = await fetch(`${this.baseUrl}/api/creator/info?id=${encodeURIComponent(figureId)}`);
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
        this.currentSheet.set(this.sheetUrlOf(figureId));
        this.statusMessage.set('alternativesReady');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async deleteModel(figureId: string): Promise<boolean> {
    this.error.set('');

    try {
      const response = await fetch(`${this.baseUrl}/api/creator/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: figureId }),
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

  async pickAlternative(figureId: string, pick: number, isCached = false): Promise<PickResponse | null> {
    const cached = isCached || this.cachedPicks().includes(pick);
    if (!cached) {
      this.activeGenerations.update((prev) => {
        const next = {
          ...prev,
          [figureId]: {
            figureId,
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
        body: JSON.stringify({ id: figureId, pick }),
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
        delete next[figureId];
        this.saveGenerations(next);
        return next;
      });
    }
  }

  private sheetUrlOf(figureId: string): string {
    return `${this.baseUrl}/api/creator/sheet?id=${encodeURIComponent(figureId)}&t=${Date.now()}`;
  }

  reset(): void {
    this.isGenerating.set(false);
    this.isPicking.set(false);
    this.statusMessage.set('');
    this.error.set('');
    this.currentSheet.set(null);
    this.currentFigureId.set('');
    this.cachedPicks.set([]);
    this.currentPick.set(null);
  }
}
