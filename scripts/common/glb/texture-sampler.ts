import sharp from 'sharp';
import type { Colour } from './glb.interface.js';

export class TextureSampler {
  private constructor(
    private readonly pixels: Buffer,
    private readonly width: number,
    private readonly height: number,
    private readonly channels: number,
  ) {}

  public static async load(png: Buffer): Promise<TextureSampler> {
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    return new TextureSampler(data, info.width, info.height, info.channels);
  }

  public colourAt(u: number, v: number): Colour {
    const column = Math.min(this.width - 1, Math.max(0, Math.floor(u * this.width)));
    const row = Math.min(this.height - 1, Math.max(0, Math.floor(v * this.height)));
    const offset = (row * this.width + column) * this.channels;
    return { red: this.pixels[offset], green: this.pixels[offset + 1], blue: this.pixels[offset + 2] };
  }
}
