/**
 * Runs the real s3-step-1 Blender script, with the pipeline and model-profile parameters, on several kinds of
 * figure (blocky, animals, vehicles) and prints one line per figure. Nothing is written under resources/: the
 * simplified shapes and a front-view sheet of all of them go to a temporary folder printed at the end.
 *
 * tsx scripts/stage-3/checks/simplify-generalisation.ts alex steve creeper darth giraffe cow police-car fire-truck
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { BlenderRunner } from '../../common/blender-runner.js';
import { ModelProfiles } from '../../common/model-profiles.js';
import { PipelineConfigLoader } from '../../common/pipeline-config.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';
import type { SimplifyStatistics, SimplifyStepDefinition } from '../interfaces/simplify.interface.js';

const BASE_NAMES = ['step-3-details.glb', 'step-4-details.glb', 'step-2-base.glb', 'step-3-base.glb'] as const;
const TILE = 360;
const RENDER_SCRIPT = 'scripts/stage-3/checks/render_closeup.py';

function baseOf(name: string): string {
  const found = BASE_NAMES.map((file) => join(WorkspacePaths.resourcePath(name), 'stage-2', file)).find(existsSync);
  if (found === undefined) throw new Error(`No stage-2 base for ${name}`);
  return found;
}

function simplify(name: string, step: SimplifyStepDefinition, work: string): string {
  const shape = join(work, `${name}.glb`);
  try {
    const result = BlenderRunner.run<SimplifyStatistics>(step.blender, step.blender.script, {
      input_glb: baseOf(name), output_json: join(work, `${name}.json`), output_glb: shape,
      ...step.parameters, ...ModelProfiles.stepParameters(name, 's3-step-1'),
    });
    console.log(`PASS ${name.padEnd(12)} faces ${String(result.meshFaces).padStart(5)}  volume ${result.volumeChangePercent}%  `
      + `size ${result.dimensionChangePercent}%  closing ${result.closingDeviationMm} mm  mode ${result.mode}`);
    return shape;
  } catch (failure) {
    console.log(`FAIL ${name.padEnd(12)} ${(failure as Error).message.split('\n').slice(-2).join(' ').slice(0, 220)}`);
    return '';
  }
}

function render(shape: string, png: string): void {
  spawnSync(step().blender.executable, ['-b', '-P', join(WorkspacePaths.appRoot, RENDER_SCRIPT), '--', shape, png,
    '30', '0.5', '0.5', '2.2'], { encoding: 'utf8' });
}

function step(): SimplifyStepDefinition {
  return PipelineConfigLoader.getStep('s3-step-1') as unknown as SimplifyStepDefinition;
}

async function sheet(shapes: readonly (readonly [string, string])[], work: string): Promise<string> {
  const tiles: OverlayOptions[] = [];
  for (const [index, [name, shape]] of shapes.entries()) {
    const png = join(work, `${name}.png`);
    if (shape) render(shape, png);
    const image = existsSync(png)
      ? await sharp(png).resize(TILE, TILE).toBuffer()
      : await sharp({ create: { width: TILE, height: TILE, channels: 3, background: '#F2C0C0' } }).png().toBuffer();
    const label = Buffer.from(`<svg width="${TILE}" height="30"><text x="8" y="22" font-size="20" font-family="Helvetica">${name}</text></svg>`);
    tiles.push({ input: image, left: (index % 4) * TILE, top: Math.floor(index / 4) * TILE });
    tiles.push({ input: label, left: (index % 4) * TILE, top: Math.floor(index / 4) * TILE });
  }
  const output = join(work, 'simplified.png');
  await sharp({ create: { width: TILE * 4, height: TILE * Math.ceil(shapes.length / 4), channels: 3, background: '#FFFFFF' } })
    .composite(tiles).png().toFile(output);
  return output;
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'simplify-generalisation-'));
  const shapes = process.argv.slice(2).map((name) => [name, simplify(name, step(), work)] as const);
  console.log(`sheet: ${await sheet(shapes, work)}`);
}

void main();
