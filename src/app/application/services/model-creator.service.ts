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
      const data = (await res.json()) as { hasAlternatives?: boolean };
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

  async pickAlternative(name: string, pick: number): Promise<PickResponse | null> {
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
      this.statusMessage.set('modelReady');
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.error.set(msg);
      return null;
    } finally {
      this.isPicking.set(false);
    }
  }

  reset(): void {
    this.isGenerating.set(false);
    this.isPicking.set(false);
    this.statusMessage.set('');
    this.error.set('');
    this.currentSheet.set(null);
    this.currentName.set('');
  }
}
