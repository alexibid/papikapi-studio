import {
  MODEL_STAGES,
  ModelColour,
  ModelPart,
  ModelStage,
  PaperModel,
  TIER_IDS,
  TierId,
} from './paper-model';

interface RawPart {
  readonly name?: unknown;
  readonly role?: unknown;
  readonly faces?: unknown;
  readonly pages?: unknown;
  readonly colours?: unknown;
  readonly netPath?: unknown;
  readonly vectorPaths?: unknown;
}

interface RawEntry {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly tier?: { readonly id?: unknown; readonly ages?: unknown; readonly style?: unknown; readonly palette?: unknown };
  readonly createdAt?: unknown;
  readonly clean?: unknown;
  readonly previewPath?: unknown;
  readonly scriptPath?: unknown;
  readonly state?: unknown;
  readonly parts?: unknown;
}

export function readCatalogue(payload: unknown): readonly PaperModel[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter(isEntry).map(toModel);
}

function isEntry(value: unknown): value is RawEntry {
  return typeof value === 'object' && value !== null && typeof (value as RawEntry).id === 'string';
}

function toModel(entry: RawEntry): PaperModel {
  return {
    id: text(entry.id),
    state: stage(entry.state),
    title: text(entry.title) || text(entry.id),
    tier: {
      id: tierId(entry.tier?.id),
      ages: text(entry.tier?.ages),
      style: text(entry.tier?.style),
      palette: text(entry.tier?.palette),
    },
    createdAt: text(entry.createdAt),
    clean: entry.clean === true,
    previewPath: text(entry.previewPath),
    scriptPath: text(entry.scriptPath),
    parts: Array.isArray(entry.parts) ? entry.parts.map(toPart) : [],
  };
}

function toPart(raw: RawPart): ModelPart {
  return {
    name: text(raw.name),
    role: text(raw.role),
    faces: count(raw.faces),
    pages: count(raw.pages),
    colours: Array.isArray(raw.colours) ? raw.colours.map(toColour) : [],
    netPath: text(raw.netPath),
    vectorPaths: Array.isArray(raw.vectorPaths) ? raw.vectorPaths.map(text).filter(Boolean) : [],
  };
}

function toColour(raw: { readonly role?: unknown; readonly hex?: unknown }): ModelColour {
  return { role: text(raw.role), hex: text(raw.hex) || 'transparent' };
}

function stage(value: unknown): ModelStage {
  const candidate = MODEL_STAGES.find((known) => known === value);
  return candidate ?? 'draft';
}

function tierId(value: unknown): TierId {
  const candidate = TIER_IDS.find((known) => known === value);
  return candidate ?? 'tier-1';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
