import { existsSync, readFileSync } from 'node:fs';
import type { GeminiGenerateOptions, GeminiGenerateResult, InlineImage } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

export type { InlineImage, GeminiGenerateOptions, GeminiGenerateResult };

export class GeminiClient {
  private static readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

  public static readonly prices: Record<string, number> = {
    'gemini-3.1-flash-lite-image': 0.02,
    'gemini-3.1-flash-image': 0.151,
    'gemini-3-pro-image': 0.134,
  };

  private static readApiKey(): string {
    if (!existsSync(WorkspacePaths.envFile)) {
      throw new Error(`Environment file missing: ${WorkspacePaths.envFile}`);
    }
    const content = readFileSync(WorkspacePaths.envFile, 'utf8');
    const match = /^GEMINI_API_KEY=(.*)$/m.exec(content);
    if (!match) {
      throw new Error('GEMINI_API_KEY is not defined in .env');
    }
    return match[1].trim().replace(/^["']|["']$/g, '');
  }

  public static sniffMime(bytes: Buffer): string {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG') {
      return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
      return 'image/webp';
    }
    return 'image/jpeg';
  }

  public static mimeExtension(mime: string): string {
    const table: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpeg',
      'image/webp': 'webp',
    };
    return table[mime] ?? 'jpeg';
  }

  public static async generate(model: string, options: GeminiGenerateOptions): Promise<GeminiGenerateResult> {
    const key = this.readApiKey();
    const parts: Array<Record<string, unknown>> = [];

    if (options.referenceImages) {
      for (const img of options.referenceImages) {
        parts.push({
          inlineData: {
            mimeType: img.mime,
            data: img.bytes.toString('base64'),
          },
        });
      }
    }

    parts.push({ text: options.prompt });

    const payload: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(options.aspectRatio ? { imageConfig: { aspectRatio: options.aspectRatio } } : {}),
      },
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
    };

    const url = `${this.endpoint}/${model}:generateContent?key=${key}`;
    const start = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const json = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: {
              mimeType?: string;
              data?: string;
            };
          }>;
        };
      }>;
    };

    const inlineData = json.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error('Gemini API did not return an image candidate');
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const bytes = Buffer.from(inlineData.data, 'base64');
    const mime = inlineData.mimeType ? inlineData.mimeType : this.sniffMime(bytes);

    return { bytes, mime, seconds: duration };
  }

  public static async auditVision(model: string, options: { system?: string; prompt: string; images: Array<{ bytes: Buffer; mime: string }> }): Promise<string> {
    const key = this.readApiKey();
    const parts: Array<Record<string, unknown>> = [];

    for (const img of options.images) {
      parts.push({
        inlineData: {
          mimeType: img.mime,
          data: img.bytes.toString('base64'),
        },
      });
    }
    parts.push({ text: options.prompt });

    const payload: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT'],
      },
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
    };

    const url = `${this.endpoint}/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const json = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
