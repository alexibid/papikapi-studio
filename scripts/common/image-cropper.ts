import sharp from 'sharp';
import type { CropCellOptions } from './interfaces/index.js';

export type { CropCellOptions };

interface CellRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export class ImageCropper {
  private static readonly insetRatio = 0.025;
  private static readonly defaultQuality = 0.95;

  public static async cropCell(options: CropCellOptions): Promise<Buffer> {
    this.assertPickInRange(options);

    const { width, height } = await sharp(options.imageBuffer).metadata();
    const region = this.cellRegion(options, width, height);
    const quality = Math.round((options.quality ?? this.defaultQuality) * 100);

    return sharp(options.imageBuffer).extract(region).jpeg({ quality }).toBuffer();
  }

  private static assertPickInRange(options: CropCellOptions): void {
    const total = options.columns * options.rows;
    if (options.pickIndex < 1 || options.pickIndex > total) {
      throw new Error(`Pick index ${options.pickIndex} out of bounds [1, ${total}]`);
    }
  }

  private static cellRegion(options: CropCellOptions, imageWidth: number, imageHeight: number): CellRegion {
    const cellWidth = Math.floor(imageWidth / options.columns);
    const cellHeight = Math.floor(imageHeight / options.rows);
    const column = (options.pickIndex - 1) % options.columns;
    const row = Math.floor((options.pickIndex - 1) / options.columns);
    const insetX = Math.round(cellWidth * this.insetRatio);
    const insetY = Math.round(cellHeight * this.insetRatio);

    return {
      left: column * cellWidth + insetX,
      top: row * cellHeight + insetY,
      width: cellWidth - 2 * insetX,
      height: cellHeight - 2 * insetY,
    };
  }
}
