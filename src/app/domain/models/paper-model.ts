export interface PaperModel {
  readonly id: string;
  readonly modelPath: string;
  readonly imagePath: string;
  readonly secondaryImagePath?: string;
  readonly topImagePath?: string;
  readonly previewPath: string;
}
