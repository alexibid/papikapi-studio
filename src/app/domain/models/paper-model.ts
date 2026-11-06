import { FigureDisplayNames } from '@ibid/utils';

export type ModelPreviewView =
  | 'three-quarter'
  | 'three-quarter-wireframe';

export interface ModelPreview {
  readonly view: ModelPreviewView;
  readonly imagePath: string;
}

export interface PaperModel {
  readonly id: string;
  readonly displayName: FigureDisplayNames;
  readonly modelPath: string;
  readonly imagePath: string;
  readonly secondaryImagePath?: string;
  readonly topImagePath?: string;
  readonly previewPath: string;
  readonly previews: readonly ModelPreview[];
}
