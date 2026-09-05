import { describe, expect, it } from 'vitest';
import { unfoldModel } from './unfolding-engine';
import { validateKirigamiGeometry } from './geometry-validator';
import {
  SAMPLE_DINO,
  SAMPLE_FOX,
  SAMPLE_HOUSE,
  SAMPLE_PENGUIN,
} from '../data/sample-models';

describe('UnfoldingEngine', () => {
  it('unfolds sample dinosaur into A4 sheet with zero errors', () => {
    const sheet = unfoldModel(SAMPLE_DINO);

    expect(sheet.width).toBe(210);
    expect(sheet.height).toBe(297);
    expect(sheet.parts.length).toBe(SAMPLE_DINO.boxes.length);

    const report = validateKirigamiGeometry(SAMPLE_DINO, sheet);
    expect(report.isValid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('unfolds all sample models and ensures every part has tabs and folds', () => {
    const allModels = [SAMPLE_DINO, SAMPLE_PENGUIN, SAMPLE_FOX, SAMPLE_HOUSE];

    for (const model of allModels) {
      const sheet = unfoldModel(model);
      const report = validateKirigamiGeometry(model, sheet);

      expect(report.isValid).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(sheet.parts.length).toBe(model.boxes.length);

      for (const part of sheet.parts) {
        expect(part.boundaryPath).toContain('M ');
        expect(part.folds.length).toBeGreaterThan(0);
        expect(part.tabs.length).toBeGreaterThan(0);
      }
    }
  });

  it('detects invalid models with missing boxes', () => {
    const emptyModel = {
      id: 'empty',
      nameKey: 'empty',
      span: 100,
      boxes: [],
      prisms: [],
      spikes: [],
    };

    const sheet = unfoldModel(emptyModel);
    const report = validateKirigamiGeometry(emptyModel, sheet);

    expect(report.isValid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
