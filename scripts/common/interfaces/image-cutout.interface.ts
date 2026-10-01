import type { Tensor } from '@huggingface/transformers';

export interface CutoutOptions {
  readonly imageBuffer: Buffer;
}

export interface LoadedModel {
  readonly model: { (args: { input: unknown }): Promise<{ output: Tensor[] }> };
  readonly processor: { (img: unknown): Promise<{ pixel_values: unknown }> };
}
