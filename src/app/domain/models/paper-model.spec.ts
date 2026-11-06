import { describe, expect, it } from 'vitest';
import { PaperModel } from './paper-model';

describe('PaperModel', () => {
  it('instantiates valid model structure', () => {
    const model: PaperModel = {
      id: 'fox',
      displayName: { pt: 'Raposa', en: 'Fox' },
      modelPath: '/models/fox/model.glb',
      imagePath: '/models/fox/art.jpeg',
      previewPath: '/models/fox/art.jpeg',
      previews: [],
    };
    expect(model.id).toBe('fox');
    expect(model.modelPath).toBe('/models/fox/model.glb');
  });
});
