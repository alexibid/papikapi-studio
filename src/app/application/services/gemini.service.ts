import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from '@ibid/services';
import { AgeTierId } from '../../domain/models/age-tier';
import { PaperFigure } from '../../domain/models/paper-figure';
import { parseWireFigure, WireFigure } from '../../domain/services/figure-wire';
import { buildFigureSystemPrompt } from './figure-prompt';
import { FIGURE_RESPONSE_SCHEMA } from './figure-response-schema';

export interface GenerationAuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly prompt: string;
  readonly modelName: string;
  readonly success: boolean;
  readonly error?: string;
}

export type GeminiTier = 'flash' | 'pro';

const STORAGE_KEY = 'kirigami_studio_gemini_key';

const MODEL_CANDIDATES: Readonly<Record<GeminiTier, readonly string[]>> = {
  flash: ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'],
  pro: ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'],
};

function isWireFigure(value: unknown): value is WireFigure {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate['plates']) && Array.isArray(candidate['hinges']);
}

function stripCodeFence(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private readonly i18n = inject(I18nService);

  readonly apiKey = signal<string>(this.readStoredKey());
  readonly history = signal<readonly GenerationAuditRecord[]>([]);
  readonly isGenerating = signal<boolean>(false);

  constructor() {
    void this.initKeyFromEnv();
  }

  setApiKey(key: string): void {
    this.apiKey.set(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, key);
    }
  }

  async generateFigure(
    prompt: string,
    modelTier: GeminiTier = 'flash',
    tierId: AgeTierId = 'tier-7-10'
  ): Promise<PaperFigure> {
    this.isGenerating.set(true);

    try {
      const wire = await this.requestWireFigure(prompt, modelTier, tierId);
      return parseWireFigure(wire, tierId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordAudit(prompt, modelTier, false, message);
      throw err;
    } finally {
      this.isGenerating.set(false);
    }
  }

  private async requestWireFigure(
    prompt: string,
    modelTier: GeminiTier,
    tierId: AgeTierId
  ): Promise<WireFigure> {
    const key = this.apiKey();
    if (!key) {
      throw new Error(this.i18n.translate('errorMissingApiKey'));
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: buildFigureSystemPrompt(tierId) }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: FIGURE_RESPONSE_SCHEMA,
      },
    });

    let lastError = 'Generation failed';
    for (const modelName of MODEL_CANDIDATES[modelTier]) {
      const payload = await this.callModel(modelName, key, body);
      if (typeof payload === 'string') {
        lastError = payload;
        continue;
      }

      this.recordAudit(prompt, modelName, true);
      return payload;
    }

    throw new Error(lastError);
  }

  private async callModel(
    modelName: string,
    key: string,
    body: string
  ): Promise<WireFigure | string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      return `Gemini API (${modelName}) error: ${response.status} ${response.statusText}`;
    }

    const data: unknown = await response.json();
    const rawJson = this.extractText(data);
    if (!rawJson) {
      return `Empty response received from ${modelName}.`;
    }

    const parsed: unknown = JSON.parse(stripCodeFence(rawJson));
    if (!isWireFigure(parsed)) {
      return `${modelName} returned a payload without plates or hinges.`;
    }

    return parsed;
  }

  private extractText(data: unknown): string {
    if (typeof data !== 'object' || data === null) {
      return '';
    }
    const candidates = (data as Record<string, unknown>)['candidates'];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return '';
    }
    const content = (candidates[0] as Record<string, unknown>)['content'];
    if (typeof content !== 'object' || content === null) {
      return '';
    }
    const parts = (content as Record<string, unknown>)['parts'];
    if (!Array.isArray(parts) || parts.length === 0) {
      return '';
    }
    const text = (parts[0] as Record<string, unknown>)['text'];
    return typeof text === 'string' ? text : '';
  }

  private async initKeyFromEnv(): Promise<void> {
    for (const url of ['/api/env', '/assets/env.local.json']) {
      const key = await this.readKeyFrom(url);
      if (key && key !== this.apiKey()) {
        this.setApiKey(key);
        return;
      }
    }
  }

  private async readKeyFrom(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return '';
      }
      const data = (await res.json()) as { geminiKey?: string };
      return data?.geminiKey ?? '';
    } catch {
      return '';
    }
  }

  private recordAudit(prompt: string, modelName: string, success: boolean, error?: string): void {
    const record: GenerationAuditRecord = {
      id: `audit-${Date.now()}`,
      timestamp: Date.now(),
      prompt,
      modelName,
      success,
      error,
    };
    this.history.update((prev) => [record, ...prev].slice(0, 50));
  }

  private readStoredKey(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryKey = urlParams.get('geminiKey') ?? urlParams.get('apiKey');
      if (queryKey) {
        localStorage.setItem(STORAGE_KEY, queryKey);
        return queryKey;
      }
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }
}
