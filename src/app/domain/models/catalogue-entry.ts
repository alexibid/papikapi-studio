import {
  MODEL_STAGES,
  ModelColour,
  ModelGrid,
  ModelPart,
  ModelProvenance,
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
  readonly grids?: unknown;
  readonly provenance?: unknown;
  readonly state?: unknown;
  readonly parts?: unknown;
}

interface RawGrid {
  readonly intensity?: unknown;
  readonly grid?: unknown;
  readonly spacingMm?: unknown;
  readonly faces?: unknown;
  readonly previewPath?: unknown;
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
    grids: Array.isArray(entry.grids)
      ? entry.grids.map(toGrid).sort((left, right) => left.intensity - right.intensity)
      : [],
    provenance: toProvenance(entry.provenance),
    parts: Array.isArray(entry.parts) ? entry.parts.map(toPart) : [],
  };
}

function toProvenance(raw: unknown): ModelProvenance | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const machine = (source['machine'] ?? {}) as Record<string, unknown>;
  const software = (source['software'] ?? {}) as Record<string, unknown>;
  const tokens = (source['agentTokens'] ?? {}) as Record<string, unknown>;
  return {
    version: count(source['version']),
    producedAt: text(source['producedAt']),
    machine: [text(machine['cpu']), `${count(machine['cores'])} cores`,
      `${count(machine['memoryGb'])} GB`, text(machine['accelerator'])]
      .filter(Boolean).join(' · '),
    software: [text(software['blender']), text(software['reconstructor']), text(software['cutout'])]
      .filter(Boolean).join(' · '),
    stages: Array.isArray(source['stages'])
      ? (source['stages'] as Record<string, unknown>[]).map((row) => ({
          stage: text(row['stage']),
          tool: text(row['tool']),
          seconds: count(row['seconds']),
        }))
      : [],
    secondsTotal: count(source['secondsTotal']),
    agentTokens: count(tokens['spentExploring']),
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

function toGrid(raw: RawGrid): ModelGrid {
  return {
    intensity: count(raw.intensity),
    grid: count(raw.grid),
    spacingMm: count(raw.spacingMm),
    faces: count(raw.faces),
    previewPath: text(raw.previewPath),
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
