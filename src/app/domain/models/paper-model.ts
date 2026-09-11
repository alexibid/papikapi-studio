export type ModelStage = 'ready' | 'draft';

export const MODEL_STAGES: readonly ModelStage[] = ['ready', 'draft'];

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

export interface ModelStageCost {
  readonly stage: string;
  readonly tool: string;
  readonly seconds: number;
}

export interface ModelProvenance {
  readonly version: number;
  readonly producedAt: string;
  readonly machine: string;
  readonly software: string;
  readonly stages: readonly ModelStageCost[];
  readonly secondsTotal: number;
  readonly agentTokens: number;
}

export interface ModelGrid {
  readonly intensity: number;
  readonly grid: number;
  readonly spacingMm: number;
  readonly faces: number;
  readonly previewPath: string;
}

export interface PaperModel {
  readonly id: string;
  readonly state: ModelStage;
  readonly title: string;
  readonly tier: ModelTier;
  readonly createdAt: string;
  readonly clean: boolean;
  readonly previewPath: string;
  readonly grids: readonly ModelGrid[];
  readonly provenance?: ModelProvenance;
  readonly parts: readonly ModelPart[];
}

export function totalPages(model: PaperModel): number {
  return model.parts.reduce((sum, part) => sum + part.pages, 0);
}

export function totalFaces(model: PaperModel): number {
  return model.parts.reduce((sum, part) => sum + part.faces, 0);
}

export function gridAt(model: PaperModel, intensity: number): ModelGrid | undefined {
  return model.grids.find((grid) => grid.intensity === intensity);
}

export function defaultIntensity(model: PaperModel): number {
  const middle = model.grids[Math.floor(model.grids.length / 2)];
  return middle?.intensity ?? 0;
}

export function printedColours(model: PaperModel): readonly ModelColour[] {
  const seen = new Map<string, ModelColour>();
  for (const colour of model.parts.flatMap((part) => part.colours)) {
    seen.set(colour.role, colour);
  }
  return [...seen.values()];
}
