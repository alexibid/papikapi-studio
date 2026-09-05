import { PaperModel } from '../models/kirigami-model';

export const SAMPLE_PENGUIN: PaperModel = {
  id: 'box-penguin',
  nameKey: 'modelPenguin',
  span: 120,
  prisms: [],
  spikes: [],
  boxes: [
    { id: 'head', x: 0, y: -24, z: 0, width: 34, height: 28, depth: 28, hue: '#3a4a58', decor: 'face' },
    { id: 'beak', x: 0, y: -16, z: 16, width: 12, height: 8, depth: 10, hue: '#f59e0b', decor: 'none' },
    { id: 'body', x: 0, y: 16, z: 0, width: 42, height: 48, depth: 36, hue: '#2c3e50', decor: 'grin' },
    { id: 'wing-left', x: -25, y: 14, z: 0, width: 8, height: 32, depth: 20, hue: '#3a4a58', decor: 'none' },
    { id: 'wing-right', x: 25, y: 14, z: 0, width: 8, height: 32, depth: 20, hue: '#3a4a58', decor: 'none' },
    { id: 'foot-left', x: -12, y: 44, z: 8, width: 16, height: 8, depth: 24, hue: '#f59e0b', decor: 'none' },
    { id: 'foot-right', x: 12, y: 44, z: 8, width: 16, height: 8, depth: 24, hue: '#f59e0b', decor: 'none' },
  ],
};

export const SAMPLE_FOX: PaperModel = {
  id: 'box-fox',
  nameKey: 'modelFox',
  span: 130,
  prisms: [],
  spikes: [],
  boxes: [
    { id: 'head', x: 0, y: -20, z: 0, width: 36, height: 30, depth: 32, hue: '#d97706', decor: 'face' },
    { id: 'snout', x: 0, y: -12, z: 18, width: 16, height: 12, depth: 14, hue: '#fef3c7', decor: 'none' },
    { id: 'ear-left', x: -14, y: -40, z: 0, width: 10, height: 16, depth: 10, hue: '#b45309', decor: 'none' },
    { id: 'ear-right', x: 14, y: -40, z: 0, width: 10, height: 16, depth: 10, hue: '#b45309', decor: 'none' },
    { id: 'body', x: 0, y: 18, z: -4, width: 34, height: 42, depth: 34, hue: '#d97706', decor: 'none' },
    { id: 'tail', x: 0, y: 22, z: -28, width: 16, height: 20, depth: 26, hue: '#fef3c7', decor: 'none' },
  ],
};

export const SAMPLE_HOUSE: PaperModel = {
  id: 'box-house',
  nameKey: 'modelHouse',
  span: 120,
  prisms: [],
  spikes: [],
  boxes: [
    { id: 'ground-floor', x: 0, y: 14, z: 0, width: 54, height: 44, depth: 46, hue: '#e2e8f0', decor: 'face' },
    { id: 'roof', x: 0, y: -18, z: 0, width: 60, height: 24, depth: 52, hue: '#ef4444', decor: 'none' },
    { id: 'chimney', x: 16, y: -34, z: -6, width: 12, height: 18, depth: 12, hue: '#94a3b8', decor: 'none' },
  ],
};

export const SAMPLE_DINO: PaperModel = {
  id: 'box-dino',
  nameKey: 'modelDino',
  span: 150,
  prisms: [],
  boxes: [
    { id: 'head', x: 0, y: -26, z: 0, width: 62, height: 54, depth: 48, hue: '#93a672', decor: 'face' },
    { id: 'jaw', x: 0, y: 8, z: 7, width: 58, height: 16, depth: 40, hue: '#f2f0e4', decor: 'grin' },
    { id: 'body', x: 0, y: 26, z: -6, width: 40, height: 34, depth: 36, hue: '#93a672', decor: 'none' },
    { id: 'leg-left', x: -13, y: 54, z: 2, width: 15, height: 26, depth: 20, hue: '#93a672', decor: 'none' },
    { id: 'leg-right', x: 13, y: 54, z: 2, width: 15, height: 26, depth: 20, hue: '#93a672', decor: 'none' },
    { id: 'arm-left', x: -26, y: 20, z: 12, width: 9, height: 15, depth: 9, hue: '#93a672', decor: 'none' },
    { id: 'arm-right', x: 26, y: 20, z: 12, width: 9, height: 15, depth: 9, hue: '#93a672', decor: 'none' },
    { id: 'tail', x: 0, y: 30, z: -38, width: 22, height: 18, depth: 34, hue: '#93a672', decor: 'none' },
  ],
  spikes: [
    { id: 'spike-a', x: -18, y: -55, z: 0, size: 15, hue: '#c8402c' },
    { id: 'spike-b', x: 0, y: -58, z: 0, size: 18, hue: '#c8402c' },
    { id: 'spike-c', x: 18, y: -55, z: 0, size: 15, hue: '#c8402c' },
    { id: 'spike-d', x: 0, y: 12, z: -20, size: 16, hue: '#c8402c' },
    { id: 'spike-e', x: 0, y: 24, z: -46, size: 14, hue: '#c8402c' },
  ],
};

export const SAMPLE_DRAGON: PaperModel = {
  id: 'box-dragon',
  nameKey: 'modelDragon',
  span: 160,
  prisms: [],
  boxes: [
    { id: 'head', x: 0, y: -28, z: 8, width: 54, height: 44, depth: 44, hue: '#2d6a4f', decor: 'face' },
    { id: 'jaw', x: 0, y: 0, z: 18, width: 50, height: 16, depth: 36, hue: '#f2f0e4', decor: 'grin' },
    { id: 'horn-left', x: -18, y: -52, z: -4, width: 10, height: 20, depth: 10, hue: '#e76f51', decor: 'none' },
    { id: 'horn-right', x: 18, y: -52, z: -4, width: 10, height: 20, depth: 10, hue: '#e76f51', decor: 'none' },
    { id: 'neck', x: 0, y: 6, z: -6, width: 34, height: 20, depth: 28, hue: '#40916c', decor: 'none' },
    { id: 'body', x: 0, y: 28, z: -12, width: 44, height: 36, depth: 42, hue: '#2d6a4f', decor: 'none' },
    { id: 'wing-left', x: -38, y: 16, z: -8, width: 32, height: 28, depth: 6, hue: '#d8572a', decor: 'none' },
    { id: 'wing-right', x: 38, y: 16, z: -8, width: 32, height: 28, depth: 6, hue: '#d8572a', decor: 'none' },
    { id: 'leg-left', x: -16, y: 56, z: -4, width: 16, height: 24, depth: 22, hue: '#1b4332', decor: 'none' },
    { id: 'leg-right', x: 16, y: 56, z: -4, width: 16, height: 24, depth: 22, hue: '#1b4332', decor: 'none' },
    { id: 'tail', x: 0, y: 36, z: -44, width: 22, height: 18, depth: 36, hue: '#2d6a4f', decor: 'none' },
  ],
  spikes: [
    { id: 'crest-head-1', x: -12, y: -52, z: 6, size: 16, hue: '#e63946' },
    { id: 'crest-head-2', x: 0, y: -56, z: 10, size: 20, hue: '#e63946' },
    { id: 'crest-head-3', x: 12, y: -52, z: 6, size: 16, hue: '#e63946' },
    { id: 'spine-neck', x: 0, y: -8, z: -18, size: 16, hue: '#e63946' },
    { id: 'spine-back', x: 0, y: 14, z: -28, size: 18, hue: '#e63946' },
    { id: 'spine-tail-1', x: 0, y: 28, z: -50, size: 16, hue: '#e63946' },
    { id: 'spine-tail-2', x: 0, y: 34, z: -70, size: 14, hue: '#e63946' },
  ],
};

export const SAMPLE_MODELS: readonly PaperModel[] = [
  SAMPLE_DINO,
  SAMPLE_DRAGON,
  SAMPLE_PENGUIN,
  SAMPLE_FOX,
  SAMPLE_HOUSE,
];

