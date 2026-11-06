import { describe, expect, it } from 'vitest';
import { readCatalogue } from './catalogue-entry';

describe('readCatalogue', () => {
  const rawEntry = {
    id: 'fox',
    displayName: { pt: 'Raposa', en: 'Fox' },
    model: 'model.glb',
    image: 'art.jpeg',
    secondaryImage: 'side.png',
    topImage: 'top.png',
    preview: 'preview.png',
  };

  it('returns empty array when payload is not an array', () => {
    expect(readCatalogue(null)).toEqual([]);
    expect(readCatalogue({})).toEqual([]);
    expect(readCatalogue('[]')).toEqual([]);
    expect(readCatalogue(undefined)).toEqual([]);
  });

  it('filters out items without a valid string id', () => {
    expect(readCatalogue([{ model: 'model.glb' }, { id: 123 }, null])).toEqual([]);
  });

  it('transforms valid entry into PaperModel with default paths', () => {
    const [model] = readCatalogue([{ id: 'bear' }]);
    expect(model.id).toBe('bear');
    expect(model.modelPath).toBe('/models/bear/model.glb');
    expect(model.imagePath).toBe('/models/bear/input.jpeg');
    expect(model.previewPath).toBe('/models/bear/preview.png');
    expect(model.secondaryImagePath).toBeUndefined();
    expect(model.topImagePath).toBeUndefined();
    expect(model.displayName).toEqual({ pt: 'bear', en: 'bear' });
    expect(model.previews).toEqual([]);
  });

  it('reads the previews the pipeline published', () => {
    const previews = [
      { view: 'three-quarter', image: 'preview-three-quarter.webp' },
      { view: 'three-quarter-wireframe', image: 'preview-three-quarter-wireframe.webp' },
    ];
    const [model] = readCatalogue([{ id: 'fox', previews }]);
    expect(model.previews).toEqual([
      { view: 'three-quarter', imagePath: '/models/fox/preview-three-quarter.webp' },
      { view: 'three-quarter-wireframe', imagePath: '/models/fox/preview-three-quarter-wireframe.webp' },
    ]);
  });

  it('skips previews with an unknown view or no image', () => {
    const previews = [{ view: 'top', image: 'top.png' }, { view: 'three-quarter', image: '' }, null];
    const [model] = readCatalogue([{ id: 'fox', previews }]);
    expect(model.previews).toEqual([]);
  });

  it('populates custom image and secondary paths when present', () => {
    const [model] = readCatalogue([rawEntry]);
    expect(model.id).toBe('fox');
    expect(model.modelPath).toBe('/models/fox/model.glb');
    expect(model.imagePath).toBe('/models/fox/art.jpeg');
    expect(model.secondaryImagePath).toBe('/models/fox/side.png');
    expect(model.topImagePath).toBe('/models/fox/top.png');
    expect(model.previewPath).toBe('/models/fox/preview.png');
    expect(model.displayName).toEqual({ pt: 'Raposa', en: 'Fox' });
  });

  it('filters out items with empty model or image strings', () => {
    expect(readCatalogue([{ id: 'cheetah', model: '' }, { id: 'lion', image: '' }])).toEqual([]);
  });
});
