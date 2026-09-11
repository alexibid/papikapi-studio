import { describe, expect, it } from 'vitest';
import { readCatalogue } from './catalogue-entry';

describe('readCatalogue', () => {
  const entry = {
    id: 'cat-v2',
    state: 'draft',
    title: 'Cat',
    tier: { id: 'tier-4', ages: '13+', style: 'High-density 3D puzzle', palette: 'monochrome' },
    createdAt: '2026-09-07T21:00:29+00:00',
    clean: true,
    previewPath: '/uploads/models/cat-v2/grid-2.glb',
    grids: [
      { intensity: 2, grid: 18, spacingMm: 12.563, faces: 491, previewPath: '/uploads/models/cat-v2/grid-2.glb' },
      { intensity: 1, grid: 15, spacingMm: 15.075, faces: 338, previewPath: '/uploads/models/cat-v2/grid-1.glb' },
    ],
    parts: [
      {
        name: 'cat',
        role: 'primary',
        faces: 568,
        pages: 4,
        colours: [{ role: 'primary', hex: '#2A2A30' }],
        netPath: '/uploads/draft/cat-v2/nets/cat.pdf',
        vectorPaths: ['/uploads/draft/cat-v2/nets/cat_page0.svg'],
      },
    ],
  };

  it('returns nothing for a payload that is not an array', () => {
    expect(readCatalogue(null)).toEqual([]);
    expect(readCatalogue({})).toEqual([]);
    expect(readCatalogue('[]')).toEqual([]);
  });

  it('drops rows that carry no string id', () => {
    expect(readCatalogue([{ title: 'no id' }, { id: 7 }])).toEqual([]);
  });

  it('reads a published model with its parts', () => {
    const [model] = readCatalogue([entry]);

    expect(model.id).toBe('cat-v2');
    expect(model.state).toBe('draft');
    expect(model.tier.id).toBe('tier-4');
    expect(model.clean).toBe(true);
    expect(model.parts).toHaveLength(1);
    expect(model.parts[0].pages).toBe(4);
    expect(model.parts[0].colours[0].hex).toBe('#2A2A30');
  });

  it('keeps every known shelf and falls back to draft for anything else', () => {
    const shelves = readCatalogue([
      { ...entry, id: 'a', state: 'ready' },
      { ...entry, id: 'b', state: 'draft' },
      { ...entry, id: 'c', state: 'nowhere' },
      { ...entry, id: 'd', state: 'archived' },
      { ...entry, id: 'e', state: undefined },
    ]).map((model) => model.state);

    expect(shelves).toEqual(['ready', 'draft', 'draft', 'draft', 'draft']);
  });

  it('falls back to the id when a model carries no title', () => {
    const [model] = readCatalogue([{ ...entry, title: undefined }]);

    expect(model.title).toBe('cat-v2');
  });

  it('replaces a missing colour with a transparent swatch', () => {
    const [model] = readCatalogue([
      { ...entry, parts: [{ ...entry.parts[0], colours: [{ role: 'primary' }] }] },
    ]);

    expect(model.parts[0].colours[0].hex).toBe('transparent');
  });

  it('falls back to tier-1 for an unknown tier', () => {
    const [model] = readCatalogue([{ ...entry, tier: { id: 'tier-9' } }]);

    expect(model.tier.id).toBe('tier-1');
  });

  it('sorts the grids by intensity and drops a payload without them', () => {
    const [withGrids] = readCatalogue([entry]);
    expect(withGrids.grids.map((grid) => grid.intensity)).toEqual([1, 2]);

    const [without] = readCatalogue([{ ...entry, grids: undefined }]);
    expect(without.grids).toEqual([]);
  });
});
