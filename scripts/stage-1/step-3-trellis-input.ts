import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  TrellisInputRequest,
  TrellisInputResponse,
  TrellisInputStepDefinition,
} from './stage-1.interface.js';
import { ImageCutout } from '../common/image-cutout.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export class TrellisInputGenerator {
  private static readonly stepId = 's1-step-3';
  private static readonly promptPlaneColour = /sheet of (?:solid saturated|matte) ([\w ]+?) paper/;

  /** The plane colour the system prompt chose; older manifests only keep it inside the FLUX prompt. */
  private static planeColour(name: string): string | undefined {
    const data = ManifestManager.readStepResult(name, 's1-step-1')?.data ?? {};
    if (typeof data.planeColour === 'string') return data.planeColour;
    return typeof data.fluxPrompt === 'string' ? this.promptPlaneColour.exec(data.fluxPrompt)?.[1] : undefined;
  }

  private static planeArguments(step: TrellisInputStepDefinition, name: string): readonly string[] {
    const colour = this.planeColour(name);
    const rgb = colour === undefined ? undefined : step.parameters.plane_rgb[colour];
    return rgb === undefined ? [] : ['--plane-rgb', rgb.join(',')];
  }

  private static runPython(step: TrellisInputStepDefinition, mode: string, args: readonly string[]): Record<string, unknown> {
    const script = join(WorkspacePaths.appRoot, step.parameters.python_script);
    const outcome = spawnSync('python3', [script, mode, ...args], { encoding: 'utf8' });
    if (outcome.status !== 0) {
      throw new Error(`TRELLIS input ${mode} failed: ${outcome.stderr}`);
    }
    return JSON.parse(outcome.stdout.trim()) as Record<string, unknown>;
  }

  private static async enlargedCutout(
    step: TrellisInputStepDefinition,
    paths: { readonly cutout: string; readonly work: string },
    plane: readonly string[],
  ): Promise<{ path: string; report: Record<string, unknown> }> {
    const { super_resolution } = step.parameters;
    const enlargedColour = join(paths.work, 'enlarged.png');
    const report = this.runPython(step, 'prepare', [
      '--cutout', paths.cutout, '--out', enlargedColour,
      '--sr-binary', super_resolution.binary, '--sr-model', super_resolution.model,
      '--sr-scale', String(super_resolution.scale), ...plane,
    ]);
    const enlargedCutoutPath = join(paths.work, 'enlarged-cutout.png');
    writeFileSync(enlargedCutoutPath, await ImageCutout.extractCutout({ imageBuffer: readFileSync(enlargedColour) }));
    return { path: enlargedCutoutPath, report };
  }

  public static async execute(request: TrellisInputRequest): Promise<TrellisInputResponse> {
    const { name } = request;
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as TrellisInputStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(name), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const startMsg = step.messages.start.replace('{model}', name);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, startMsg);

    const start = Date.now();
    const cutoutPath = join(stageDir, step.outputs.cutout_resource);
    const trellisInputPath = join(stageDir, step.outputs.trellis_input_resource);
    writeFileSync(cutoutPath, await ImageCutout.extractCutout({ imageBuffer: readFileSync(join(stageDir, step.inputs.art_resource)) }));

    const work = mkdtempSync(join(tmpdir(), 'papikapi-trellis-input-'));
    let report: Record<string, unknown>;
    try {
      const enlarged = await this.enlargedCutout(step, { cutout: cutoutPath, work }, this.planeArguments(step, name));
      const size = String(step.parameters.image_size);
      const composed = this.runPython(step, 'compose', ['--cutout', enlarged.path, '--out', trellisInputPath, '--size', size]);
      report = { ...enlarged.report, ...composed };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const completedMsg = step.messages.completed.replace('{model}', name).replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, completedMsg);

    ManifestManager.writeStepResult(name, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: step.manifest_contract.costUsd,
      costNote: step.manifest_contract.costNote,
      data: report,
    });
    return { name, cutoutPath, trellisInputPath };
  }
}
