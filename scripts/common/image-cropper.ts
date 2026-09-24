import { createCanvas, loadImage } from 'canvas';

export interface CropCellOptions {
  readonly imageBuffer: Buffer;
  readonly columns: number;
  readonly rows: number;
  readonly pickIndex: number;
  readonly quality?: number;
}

export class ImageCropper {
  public static async cropCell(options: CropCellOptions): Promise<Buffer> {
    const total = options.columns * options.rows;
    if (options.pickIndex < 1 || options.pickIndex > total) {
      throw new Error(`Pick index ${options.pickIndex} out of bounds [1, ${total}]`);
    }

    const img = await loadImage(options.imageBuffer);
    const cellWidth = Math.floor(img.width / options.columns);
    const cellHeight = Math.floor(img.height / options.rows);

    const col = (options.pickIndex - 1) % options.columns;
    const row = Math.floor((options.pickIndex - 1) / options.columns);

    const insetX = Math.round(cellWidth * 0.025);
    const insetY = Math.round(cellHeight * 0.025);
    const startX = col * cellWidth + insetX;
    const startY = row * cellHeight + insetY;
    const cropW = cellWidth - 2 * insetX;
    const cropH = cellHeight - 2 * insetY;

    const canvas = createCanvas(cropW, cropH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

    const q = options.quality ?? 0.95;
    return canvas.toBuffer('image/jpeg', { quality: q });
  }
}
