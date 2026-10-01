export interface CropCellOptions {
  readonly imageBuffer: Buffer;
  readonly columns: number;
  readonly rows: number;
  readonly pickIndex: number;
  readonly quality?: number;
}

export interface CellRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

