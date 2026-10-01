import { AutoModel, AutoProcessor, LogLevel, RawImage, env } from '@huggingface/transformers';
import sharp from 'sharp';
import type { CutoutOptions, LoadedModel } from './interfaces/index.js';

env.allowLocalModels = false;
env.logLevel = LogLevel.ERROR;

export class ImageCutout {
  private static readonly modelId = 'briaai/RMBG-1.4';
  private static readonly opaqueThreshold = 128;
  private static readonly transparentThreshold = 20;
  private static readonly minIslandPixels = 200;
  private static readonly backgroundDistanceThreshold = 40;
  private static readonly minSaturation = 0.18;
  private static readonly borderWidthPixels = 4;
  private static readonly neighbourOffsets: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  private static modelPromise: Promise<LoadedModel> | null = null;

  public static async extractCutout(options: CutoutOptions): Promise<Buffer> {
    const image = (await RawImage.fromBlob(new Blob([new Uint8Array(options.imageBuffer)]))).rgb();
    const mask = await this.segmentMask(image);
    const alpha = this.alphaFromMask(mask.data);
    this.addColouredSolids(alpha, image);
    this.removeSmallIslands(alpha, image.width, image.height);
    return this.encodePng(image, alpha);
  }

  private static async getModel(): Promise<LoadedModel> {
    if (!this.modelPromise) {
      this.modelPromise = (async () => {
        const model = (await AutoModel.from_pretrained(this.modelId)) as unknown as LoadedModel['model'];
        const processor = (await AutoProcessor.from_pretrained(this.modelId)) as unknown as LoadedModel['processor'];
        return { model, processor };
      })();
    }
    return this.modelPromise;
  }

  private static async segmentMask(image: RawImage): Promise<RawImage> {
    const { model, processor } = await this.getModel();
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const maskTensor = output[0].mul(255).to('uint8');
    return RawImage.fromTensor(maskTensor).resize(image.width, image.height);
  }

  private static alphaFromMask(maskData: ArrayLike<number>): Uint8Array {
    const alpha = new Uint8Array(maskData.length);
    for (let index = 0; index < maskData.length; index++) {
      const value = maskData[index];
      if (value > this.opaqueThreshold) {
        alpha[index] = 255;
      } else if (value > this.transparentThreshold) {
        alpha[index] = value;
      }
    }
    return alpha;
  }

  private static estimateBackground(image: RawImage): readonly [number, number, number] {
    const channels: number[][] = [[], [], []];
    for (let row = 0; row < image.height; row++) {
      for (let column = 0; column < image.width; column++) {
        const onBorder =
          row < this.borderWidthPixels ||
          column < this.borderWidthPixels ||
          row >= image.height - this.borderWidthPixels ||
          column >= image.width - this.borderWidthPixels;
        if (!onBorder) continue;
        const offset = (row * image.width + column) * 3;
        for (let channel = 0; channel < 3; channel++) channels[channel].push(image.data[offset + channel]);
      }
    }
    const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return [median(channels[0]), median(channels[1]), median(channels[2])];
  }

  private static addColouredSolids(alpha: Uint8Array, image: RawImage): void {
    const [backgroundRed, backgroundGreen, backgroundBlue] = this.estimateBackground(image);
    for (let pixel = 0; pixel < alpha.length; pixel++) {
      const red = image.data[pixel * 3];
      const green = image.data[pixel * 3 + 1];
      const blue = image.data[pixel * 3 + 2];
      const distance = Math.hypot(red - backgroundRed, green - backgroundGreen, blue - backgroundBlue);
      const brightest = Math.max(red, green, blue);
      const saturation = brightest === 0 ? 0 : (brightest - Math.min(red, green, blue)) / brightest;
      if (distance > this.backgroundDistanceThreshold && saturation > this.minSaturation) alpha[pixel] = 255;
    }
  }

  private static removeSmallIslands(alpha: Uint8Array, width: number, height: number): void {
    const islands = this.findIslands(alpha, width, height).sort((a, b) => b.length - a.length);
    for (const island of islands.slice(1)) {
      if (island.length < this.minIslandPixels) {
        island.forEach((pixel) => (alpha[pixel] = 0));
      }
    }
  }

  private static findIslands(alpha: Uint8Array, width: number, height: number): number[][] {
    const visited = new Uint8Array(alpha.length);
    const islands: number[][] = [];
    for (let pixel = 0; pixel < alpha.length; pixel++) {
      if (alpha[pixel] > 0 && visited[pixel] === 0) {
        islands.push(this.floodFill(pixel, alpha, visited, { width, height }));
      }
    }
    return islands;
  }

  private static floodFill(
    seed: number,
    alpha: Uint8Array,
    visited: Uint8Array,
    size: { readonly width: number; readonly height: number },
  ): number[] {
    const island = [seed];
    visited[seed] = 1;
    for (let head = 0; head < island.length; head++) {
      const column = island[head] % size.width;
      const row = Math.floor(island[head] / size.width);
      for (const [offsetX, offsetY] of this.neighbourOffsets) {
        const neighbourX = column + offsetX;
        const neighbourY = row + offsetY;
        if (neighbourX < 0 || neighbourX >= size.width || neighbourY < 0 || neighbourY >= size.height) continue;
        const neighbour = neighbourY * size.width + neighbourX;
        if (alpha[neighbour] > 0 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          island.push(neighbour);
        }
      }
    }
    return island;
  }

  private static encodePng(image: RawImage, alpha: Uint8Array): Promise<Buffer> {
    const totalPixels = image.width * image.height;
    const rgba = Buffer.alloc(totalPixels * 4);
    for (let pixel = 0; pixel < totalPixels; pixel++) {
      rgba[pixel * 4] = image.data[pixel * 3];
      rgba[pixel * 4 + 1] = image.data[pixel * 3 + 1];
      rgba[pixel * 4 + 2] = image.data[pixel * 3 + 2];
      rgba[pixel * 4 + 3] = alpha[pixel];
    }
    return sharp(rgba, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
  }
}
