import { PaperModel } from './paper-model';

const MODELS_ROOT = '/models';

interface RawEntry {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly image?: unknown;
  readonly secondaryImage?: unknown;
  readonly topImage?: unknown;
  readonly preview?: unknown;
}

export function readCatalogue(payload: unknown): readonly PaperModel[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter(isEntry).map(toModel);
}

function isEntry(value: unknown): value is RawEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as RawEntry;
  if (typeof entry.id !== 'string' || entry.id.trim() === '') {
    return false;
  }
  if (entry.model !== undefined && (typeof entry.model !== 'string' || entry.model.trim() === '')) {
    return false;
  }
  if (entry.image !== undefined && (typeof entry.image !== 'string' || entry.image.trim() === '')) {
    return false;
  }
  return true;
}

function toModel(entry: RawEntry): PaperModel {
  const id = text(entry.id);
  const base = `${MODELS_ROOT}/${id}`;
  const secondaryImage = text(entry.secondaryImage);
  const topImage = text(entry.topImage);
  return {
    id,
    modelPath: `${base}/${text(entry.model) || 'model.glb'}`,
    imagePath: `${base}/${text(entry.image) || 'input.jpeg'}`,
    ...(secondaryImage ? { secondaryImagePath: `${base}/${secondaryImage}` } : {}),
    ...(topImage ? { topImagePath: `${base}/${topImage}` } : {}),
    previewPath: `${base}/${text(entry.preview) || 'preview.png'}`,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
