import type { Tensor } from '@huggingface/transformers';

export interface CutoutOptions {
  readonly imageBuffer: Buffer;
}

export interface LoadedModel {
  readonly model: { (args: { input_image: unknown }): Promise<{ output_image: Tensor[] }> };
  readonly processor: { (img: unknown): Promise<{ pixel_values: unknown }> };
}
