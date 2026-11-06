import { FigureDisplayNames } from '@ibid/utils';
import { ModelPreview, ModelPreviewView, PaperModel } from './paper-model';

const MODELS_ROOT = '/models';
const PREVIEW_VIEWS: readonly ModelPreviewView[] = [
  'three-quarter',
  'three-quarter-wireframe',
];

interface RawEntry {
  readonly id?: unknown;
  readonly displayName?: unknown;
  readonly model?: unknown;
  readonly image?: unknown;
  readonly secondaryImage?: unknown;
  readonly topImage?: unknown;
  readonly preview?: unknown;
  readonly previews?: unknown;
}

interface RawPreview {
  readonly view?: unknown;
  readonly image?: unknown;
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
    displayName: displayNamesOf(entry.displayName, id),
    modelPath: `${base}/${text(entry.model) || 'model.glb'}`,
    imagePath: `${base}/${text(entry.image) || 'input.jpeg'}`,
    ...(secondaryImage ? { secondaryImagePath: `${base}/${secondaryImage}` } : {}),
    ...(topImage ? { topImagePath: `${base}/${topImage}` } : {}),
    previewPath: `${base}/${text(entry.preview) || 'preview.png'}`,
    previews: previewsOf(entry.previews, base),
  };
}

function previewsOf(value: unknown, base: string): readonly ModelPreview[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPreview).map((preview) => ({
    view: preview.view,
    imagePath: `${base}/${preview.image}`,
  }));
}

function isPreview(value: unknown): value is RawPreview & { view: ModelPreviewView; image: string } {
  if (typeof value !== 'object' || value === null) return false;
  const preview: RawPreview = value;
  return isPreviewView(preview.view) && typeof preview.image === 'string' && preview.image.trim() !== '';
}

function isPreviewView(value: unknown): value is ModelPreviewView {
  return PREVIEW_VIEWS.some((view) => view === value);
}

function displayNamesOf(value: unknown, id: string): FigureDisplayNames {
  if (typeof value !== 'object' || value === null) return { pt: id, en: id };
  const names = value as { readonly pt?: unknown; readonly en?: unknown };
  return { pt: text(names.pt) || id, en: text(names.en) || id };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
