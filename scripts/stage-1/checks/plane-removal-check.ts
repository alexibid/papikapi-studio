/**
 * Rebuilds each figure's TRELLIS input with the plane colour the system prompt chose, without RunPod, and prints
 * how many plane pixels were hidden. QA only reads resources/: the work happens in a temporary folder that is
 * deleted at the end, nothing is written under resources/ or public/.
 *
 * tsx scripts/stage-1/checks/plane-removal-check.ts alex ankylosaurus bear black-tuxedo blue-eyed-pug
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImageCutout } from '../../common/image-cutout.js';
import { ManifestManager } from '../../common/manifest-manager.js';
import { PipelineConfigLoader } from '../../common/pipeline-config.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';
import type { TrellisInputStepDefinition } from '../stage-1.interface.js';

const PLANE_IN_PROMPT = /sheet of (?:solid saturated|matte) ([\w ]+?) paper/;

function planeColour(name: string): string {
  const data = ManifestManager.readStepResult(name, 's1-step-1')?.data ?? {};
  if (typeof data.planeColour === 'string') return data.planeColour;
  const colour = typeof data.fluxPrompt === 'string' ? PLANE_IN_PROMPT.exec(data.fluxPrompt)?.[1] : undefined;
  if (colour === undefined) throw new Error(`No plane colour recorded for ${name}`);
  return colour;
}

function runPython(step: TrellisInputStepDefinition, args: readonly string[]): Record<string, unknown> {
  const outcome = spawnSync('python3', [join(WorkspacePaths.appRoot, step.parameters.python_script), ...args], {
    encoding: 'utf8',
  });
  if (outcome.status !== 0) throw new Error(outcome.stderr);
  return JSON.parse(outcome.stdout.trim()) as Record<string, unknown>;
}

async function hiddenPlanePixels(name: string, step: TrellisInputStepDefinition, work: string): Promise<unknown> {
  const art = join(WorkspacePaths.resourcePath(name), 'stage-1', 'step-2-art.jpeg');
  const cutout = join(work, `${name}-cutout.png`);
  writeFileSync(cutout, await ImageCutout.extractCutout({ imageBuffer: readFileSync(art) }));
  const { super_resolution: sr } = step.parameters;
  const report = runPython(step, ['prepare', '--cutout', cutout, '--out', join(work, `${name}-enlarged.png`),
    '--sr-binary', sr.binary, '--sr-model', sr.model, '--sr-scale', String(sr.scale),
    '--plane-rgb', step.parameters.plane_rgb[planeColour(name)].join(',')]);
  return report.plinthPixels;
}

async function main(): Promise<void> {
  const step = PipelineConfigLoader.getStep('s1-step-3') as unknown as TrellisInputStepDefinition;
  const work = mkdtempSync(join(tmpdir(), 'plane-removal-check-'));
  try {
    for (const name of process.argv.slice(2)) {
      console.log(`${name}: plane ${planeColour(name)}, hidden pixels ${String(await hiddenPlanePixels(name, step, work))}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

void main();
