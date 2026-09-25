export interface InlineImage {
  readonly bytes: Buffer;
  readonly mime: string;
}

export interface GeminiGenerateOptions {
  readonly system?: string;
  readonly prompt: string;
  readonly referenceImages?: readonly InlineImage[];
  readonly aspectRatio?: string;
}

export interface GeminiGenerateResult {
  readonly bytes: Buffer;
  readonly mime: string;
  readonly seconds: number;
}
