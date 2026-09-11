import { describe, expect, it } from 'vitest';
import {
  MODEL_STAGES,
  PaperModel,
  defaultIntensity,
  gridAt,
  printedColours,
  totalFaces,
  totalPages,
} from './paper-model';

describe('paper-model', () => {
  const model: PaperModel = {
    id: 'fox',
    state: 'draft',
    title: 'Sitting fox',
    tier: { id: 'tier-4', ages: '13+', style: 'High-density 3D puzzle', palette: 'monochrome' },
    createdAt: '2026-09-07T21:00:29+00:00',
    clean: true,
    previewPath: '/uploads/models/fox/grid-3.glb',
    grids: [
      { intensity: 1, grid: 15, spacingMm: 15.075, faces: 338, previewPath: '/uploads/models/fox/grid-1.glb' },
      { intensity: 2, grid: 18, spacingMm: 12.563, faces: 491, previewPath: '/uploads/models/fox/grid-2.glb' },
      { intensity: 3, grid: 20, spacingMm: 11.307, faces: 591, previewPath: '/uploads/models/fox/grid-3.glb' },
    ],
    parts: [
      {
        name: 'body',
        role: 'primary',
        faces: 400,
        pages: 3,
        colours: [{ role: 'primary', hex: '#D9773F' }, { role: 'shade', hex: '#F4EDE2' }],
        netPath: '/uploads/draft/fox/nets/body.pdf',
        vectorPaths: [],
      },
      {
        name: 'base',
        role: 'neutral',
        faces: 6,
        pages: 1,
        colours: [{ role: 'shade', hex: '#F4EDE2' }],
        netPath: '/uploads/draft/fox/nets/base.pdf',
        vectorPaths: [],
      },
    ],
  };

  it('orders the shelves so the page opens on the approved one first', () => {
    expect(MODEL_STAGES).toEqual(['ready', 'draft']);
  });

  it('finds the grid for an intensity and nothing for one it does not carry', () => {
    expect(gridAt(model, 2)?.faces).toBe(491);
    expect(gridAt(model, 9)).toBeUndefined();
  });

  it('opens on the middle intensity', () => {
    expect(defaultIntensity(model)).toBe(2);
  });

  it('adds up the printed pages of every part', () => {
    expect(totalPages(model)).toBe(4);
  });

  it('adds up the faces of every part', () => {
    expect(totalFaces(model)).toBe(406);
  });

  it('counts a colour once however many parts print it', () => {
    expect(printedColours(model)).toEqual([
      { role: 'primary', hex: '#D9773F' },
      { role: 'shade', hex: '#F4EDE2' },
    ]);
  });

  it('measures an empty model as zero', () => {
    const empty = { ...model, parts: [] };

    expect(totalPages(empty)).toBe(0);
    expect(totalFaces(empty)).toBe(0);
    expect(printedColours(empty)).toEqual([]);
  });
});
