export type BoxDecor = 'face' | 'grin' | 'none';

export interface ModelBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly hue: string;
  readonly decor: BoxDecor;
}

export interface ModelSpike {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
  readonly hue: string;
}

export interface ModelPrism {
  readonly id: string;
  readonly profile: readonly (readonly [number, number])[];
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hue: string;
  readonly edge: string;
}

export interface PaperModel {
  readonly id: string;
  readonly nameKey: string;
  readonly span: number;
  readonly boxes: readonly ModelBox[];
  readonly prisms: readonly ModelPrism[];
  readonly spikes: readonly ModelSpike[];
}

export interface GlueTab {
  readonly id: string;
  readonly label: string;
  readonly points: readonly (readonly [number, number])[];
}

export interface FoldLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: 'mountain' | 'valley';
}

export interface UnfoldedPart {
  readonly id: string;
  readonly label: string;
  readonly hue: string;
  readonly decor: BoxDecor;
  readonly boundaryPath: string;
  readonly folds: readonly FoldLine[];
  readonly tabs: readonly GlueTab[];
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly frontFace?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface UnfoldedSheet {
  readonly width: number;
  readonly height: number;
  readonly parts: readonly UnfoldedPart[];
  readonly validationErrors: readonly string[];
}
