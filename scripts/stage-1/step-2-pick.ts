import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PickAlternativeRequest,
  PickAlternativeResponse,
  PickStepDefinition,
} from './stage-1.interface.js';
import { ImageCropper } from '../common/image-cropper.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export class AlternativePicker {
  private static readonly stepId = 's1-step-2';

  private static findSheet(folder: string, step: PickStepDefinition): string | null {
    for (const ext of step.inputs.allowed_extensions) {
      for (const prefix of [step.inputs.sheet_resource_prefix, step.inputs.sheet_public_prefix]) {
        const candidate = join(folder, `${prefix}${ext}`);
        if (existsSync(candidate)) return candidate;
      }
    }
    return null;
  }

  private static removeStaleArt(folder: string, fileName: string, extensions: readonly string[]): void {
    const base = fileName.replace(/\.[^/.]+$/, '');
    for (const extension of extensions) {
      const stale = join(folder, `${base}${extension}`);
      if (existsSync(stale)) unlinkSync(stale);
    }
  }

  public static async execute(request: PickAlternativeRequest): Promise<PickAlternativeResponse> {
    const { name, pick } = request;
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as PickStepDefinition;
    const { columns, rows } = step.parameters;
    const quality = step.parameters.jpeg_quality / 100;

    const stageDir = join(WorkspacePaths.resourcePath(name), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(name);
    const sheetPath = this.findSheet(stageDir, step) ?? this.findSheet(publicDir, step);
    if (!sheetPath) throw new Error(`Alternatives sheet not found for '${name}'`);

    const startMsg = step.messages.start.replace('{pick}', String(pick)).replace('{model}', name);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, startMsg);

    const start = Date.now();
    const sheetBuffer = readFileSync(sheetPath);
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    this.removeStaleArt(stageDir, step.outputs.art_resource, step.outputs.allowed_extensions);
    this.removeStaleArt(publicDir, step.outputs.art_public, step.outputs.allowed_extensions);

    const croppedBuffer = await ImageCropper.cropCell({ imageBuffer: sheetBuffer, columns, rows, pickIndex: pick, quality });
    const resourceArt = join(stageDir, step.outputs.art_resource);
    writeFileSync(resourceArt, croppedBuffer);
    writeFileSync(join(publicDir, step.outputs.art_public), croppedBuffer);

    for (let candidate = 1; candidate <= columns * rows; candidate++) {
      const buffer = candidate === pick
        ? croppedBuffer
        : await ImageCropper.cropCell({ imageBuffer: sheetBuffer, columns, rows, pickIndex: candidate, quality });
      writeFileSync(join(stageDir, step.outputs.art_pick_resource_pattern.replace('{pick}', String(candidate))), buffer);
      writeFileSync(join(publicDir, step.outputs.art_pick_public_pattern.replace('{pick}', String(candidate))), buffer);
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const completedMsg = step.messages.completed.replace('{pick}', String(pick)).replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, completedMsg);

    ManifestManager.writeStepResult(name, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: step.manifest_contract.costUsd,
      costNote: step.manifest_contract.costNote,
      data: { chosenPick: pick, artSize: croppedBuffer.length },
    });

    return {
      name,
      pick,
      resourceArtPath: resourceArt,
      publicArtPath: step.outputs.public_url_pattern.replace('{model}', name),
    };
  }
}
