import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FigureCleaner } from './figure-cleaner.js';
import { PipelineConfigLoader } from './pipeline-config.js';
import { WorkspacePaths } from './workspace-paths.js';

const MODEL = 'zz-figure-cleaner-spec';
const resources = (...parts: string[]): string => join(WorkspacePaths.resourcePath(MODEL), ...parts);
const publicFile = (name: string): string => join(WorkspacePaths.modelPath(MODEL), name);

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'x');
}

describe('FigureCleaner', () => {
  beforeEach(() => {
    ['stage-1/step-1-alternatives.jpeg', 'stage-1/step-2-art.jpeg', 'stage-1/step-3-trellis-input.png',
      'stage-2/step-1-3d.glb', 'stage-2/step-2-base.glb', 'stage-2/step-3-details.glb',
      'stage-3/step-1-simplify.glb', 'stage-4/step-1-net.json']
      .forEach((file) => touch(resources(file)));
    ['prompt.txt', 'alternatives.jpeg', 'art.jpeg', 'art-pick-6.jpeg', 'model.glb', 'model-pick-6.glb', 'sheets.pdf']
      .forEach((file) => touch(publicFile(file)));
  });

  afterEach(() => {
    rmSync(WorkspacePaths.resourcePath(MODEL), { recursive: true, force: true });
    rmSync(WorkspacePaths.modelPath(MODEL), { recursive: true, force: true });
  });

  it('empties the whole figure when the run starts at the first step', () => {
    FigureCleaner.cleanFrom(MODEL, PipelineConfigLoader.getStep('s1-step-1'));
    expect(existsSync(WorkspacePaths.resourcePath(MODEL))).toBe(false);
    expect(existsSync(WorkspacePaths.modelPath(MODEL))).toBe(false);
  });

  it('keeps what earlier steps made and drops that step onwards', () => {
    FigureCleaner.cleanFrom(MODEL, PipelineConfigLoader.getStep('s1-step-2'));
    expect(existsSync(resources('stage-1/step-1-alternatives.jpeg'))).toBe(true);
    expect(existsSync(publicFile('alternatives.jpeg'))).toBe(true);
    expect(existsSync(publicFile('prompt.txt'))).toBe(true);
    ['stage-1/step-2-art.jpeg', 'stage-1/step-3-trellis-input.png', 'stage-2/step-1-3d.glb',
      'stage-3/step-1-simplify.glb', 'stage-4/step-1-net.json']
      .forEach((file) => expect(existsSync(resources(file))).toBe(false));
    ['art.jpeg', 'art-pick-6.jpeg', 'model.glb', 'model-pick-6.glb', 'sheets.pdf']
      .forEach((file) => expect(existsSync(publicFile(file))).toBe(false));
  });

  it('starting at the base cut keeps the TRELLIS mesh', () => {
    FigureCleaner.cleanFrom(MODEL, PipelineConfigLoader.getStep('s2-step-2'));
    expect(existsSync(resources('stage-2/step-1-3d.glb'))).toBe(true);
    expect(existsSync(resources('stage-2/step-2-base.glb'))).toBe(false);
    expect(existsSync(resources('stage-2/step-3-details.glb'))).toBe(false);
    expect(existsSync(resources('stage-3/step-1-simplify.glb'))).toBe(false);
  });
});
