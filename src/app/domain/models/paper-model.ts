export type ModelStage = 'ready' | 'draft' | 'backup';

export const MODEL_STAGES: readonly ModelStage[] = ['ready', 'draft', 'backup'];

export type TierId = 'tier-1' | 'tier-2' | 'tier-3' | 'tier-4';

export const TIER_IDS: readonly TierId[] = ['tier-1', 'tier-2', 'tier-3', 'tier-4'];

export interface ModelTier {
  readonly id: TierId;
  readonly ages: string;
  readonly style: string;
  readonly palette: string;
}

export interface ModelColour {
  readonly role: string;
  readonly hex: string;
}

export interface ModelPart {
  readonly name: string;
  readonly role: string;
  readonly faces: number;
  readonly pages: number;
  readonly colours: readonly ModelColour[];
  readonly netPath: string;
  readonly vectorPaths: readonly string[];
}

export interface PaperModel {
  readonly id: string;
  readonly state: ModelStage;
  readonly title: string;
  readonly tier: ModelTier;
  readonly createdAt: string;
  readonly clean: boolean;
  readonly previewPath: string;
  readonly scriptPath: string;
  readonly parts: readonly ModelPart[];
}

export function totalPages(model: PaperModel): number {
  return model.parts.reduce((sum, part) => sum + part.pages, 0);
}

export function totalFaces(model: PaperModel): number {
  return model.parts.reduce((sum, part) => sum + part.faces, 0);
}

export function printedColours(model: PaperModel): readonly ModelColour[] {
  const seen = new Map<string, ModelColour>();
  for (const colour of model.parts.flatMap((part) => part.colours)) {
    seen.set(colour.role, colour);
  }
  return [...seen.values()];
}
