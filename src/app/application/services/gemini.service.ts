import { Injectable, signal } from '@angular/core';
import { PaperModel } from '../../domain/models/kirigami-model';
import { SAMPLE_DINO, SAMPLE_DRAGON, SAMPLE_PENGUIN, SAMPLE_FOX, SAMPLE_HOUSE } from '../../domain/data/sample-models';

export interface GenerationAuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly prompt: string;
  readonly modelName: string;
  readonly success: boolean;
  readonly error?: string;
}

const STORAGE_KEY = 'kirigami_studio_gemini_key';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  readonly apiKey = signal<string>(this.readStoredKey());
  readonly history = signal<readonly GenerationAuditRecord[]>([]);
  readonly isGenerating = signal<boolean>(false);

  setApiKey(key: string): void {
    this.apiKey.set(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, key);
    }
  }

  async generateModel(prompt: string, modelType: 'flash' | 'pro' = 'flash'): Promise<PaperModel> {
    const key = this.apiKey();
    this.isGenerating.set(true);

    try {
      if (!key) {
        const fallback = this.resolveFallbackModel(prompt);
        this.recordAudit(prompt, modelType, true);
        return fallback;
      }

      const modelName = modelType === 'pro' ? 'gemini-1.5-pro' : 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

      const systemInstruction = `You are a professional kirigami and 3D papercraft toy designer.
Generate a valid Kirigami 3D model composed of cuboid boxes and triangular dorsal spines following the provided JSON schema.
Constraints:
- Models must be cute, expressive, stylized papercraft toys.
- Each box has id, x, y, z relative coordinates, width, height, depth (between 10 and 65mm), hue (hex color code), and decor ('face' | 'grin' | 'none').
- The model must have between 3 and 12 boxes.
- For animals, dragons, or dinosaurs:
  - Include head (decor 'face'), jaw (decor 'grin' with saw-tooth teeth), limbs, and tail.
  - For dragons/reptiles, add spikes array with dorsal crests along spine/head/tail.
- Output ONLY pure JSON matching the schema.`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                nameKey: { type: 'STRING' },
                span: { type: 'NUMBER' },
                boxes: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      id: { type: 'STRING' },
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                      z: { type: 'NUMBER' },
                      width: { type: 'NUMBER' },
                      height: { type: 'NUMBER' },
                      depth: { type: 'NUMBER' },
                      hue: { type: 'STRING' },
                      decor: { type: 'STRING', enum: ['face', 'grin', 'none'] },
                    },
                    required: ['id', 'x', 'y', 'z', 'width', 'height', 'depth', 'hue', 'decor'],
                  },
                },
                spikes: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      id: { type: 'STRING' },
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                      z: { type: 'NUMBER' },
                      size: { type: 'NUMBER' },
                      hue: { type: 'STRING' },
                    },
                    required: ['id', 'x', 'y', 'z', 'size', 'hue'],
                  },
                },
              },
              required: ['id', 'nameKey', 'span', 'boxes'],
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) {
        throw new Error('Empty response received from Gemini.');
      }

      const cleanJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      const result: PaperModel = {
        id: parsed.id || `kirigami-${Date.now()}`,
        nameKey: parsed.nameKey || 'customModel',
        span: parsed.span || 120,
        boxes: parsed.boxes || [],
        prisms: [],
        spikes: parsed.spikes || [],
      };

      this.recordAudit(prompt, modelType, true);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordAudit(prompt, modelType, false, message);
      throw err;
    } finally {
      this.isGenerating.set(false);
    }
  }

  private resolveFallbackModel(prompt: string): PaperModel {
    const lower = prompt.toLowerCase();
    if (lower.includes('drag') || lower.includes('dragon')) return SAMPLE_DRAGON;
    if (lower.includes('dino') || lower.includes('dinossauro')) return SAMPLE_DINO;
    if (lower.includes('fox') || lower.includes('raposa')) return SAMPLE_FOX;
    if (lower.includes('house') || lower.includes('casa')) return SAMPLE_HOUSE;
    return SAMPLE_PENGUIN;
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
    if (typeof window === 'undefined') return '';
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryKey = urlParams.get('geminiKey') || urlParams.get('apiKey');
      if (queryKey) {
        localStorage.setItem(STORAGE_KEY, queryKey);
        return queryKey;
      }
    } catch {}
    return localStorage.getItem(STORAGE_KEY) || '';
  }
}
