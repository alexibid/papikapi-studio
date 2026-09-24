import { describe, expect, it } from 'vitest';
import { PaperModel } from './paper-model';

describe('PaperModel', () => {
  it('instantiates valid model structure', () => {
    const model: PaperModel = {
      id: 'fox',
      modelPath: '/models/fox/model.glb',
      imagePath: '/models/fox/art.jpeg',
      previewPath: '/models/fox/art.jpeg',
    };
    expect(model.id).toBe('fox');
    expect(model.modelPath).toBe('/models/fox/model.glb');
  });
});
