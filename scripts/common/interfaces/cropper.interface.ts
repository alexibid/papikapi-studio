export interface CropCellOptions {
  readonly imageBuffer: Buffer;
  readonly columns: number;
  readonly rows: number;
  readonly pickIndex: number;
  readonly quality?: number;
}
