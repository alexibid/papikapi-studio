import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
      const candidate1 = join(folder, `${step.inputs.sheet_resource_prefix}${ext}`);
      if (existsSync(candidate1)) return candidate1;
      const candidate2 = join(folder, `${step.inputs.sheet_public_prefix}${ext}`);
      if (existsSync(candidate2)) return candidate2;
    }
    return null;
  }

  public static async execute(request: PickAlternativeRequest): Promise<PickAlternativeResponse> {
    const { name, pick } = request;
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as PickStepDefinition;
    const params = step.parameters;
    const columns = params.columns;
    const rows = params.rows;
    const quality = params.jpeg_quality / 100;

    const stage0Dir = join(WorkspacePaths.resourcePath(name), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(name);

    const stage0Sheet = this.findSheet(stage0Dir, step);
    const sheetPath = stage0Sheet !== null ? stage0Sheet : this.findSheet(publicDir, step);
    if (!sheetPath) {
      throw new Error(`Alternatives sheet not found for '${name}'`);
    }

    const startMsg = step.messages.start.replace('{pick}', String(pick)).replace('{model}', name);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, startMsg);

    const start = Date.now();
    const sheetBuffer = readFileSync(sheetPath);
    const croppedBuffer = await ImageCropper.cropCell({
      imageBuffer: sheetBuffer,
      columns,
      rows,
      pickIndex: pick,
      quality,
    });

    mkdirSync(stage0Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const resourceArt = join(stage0Dir, step.outputs.art_resource);
    const publicArt = join(publicDir, step.outputs.art_public);

    for (const fileExt of step.outputs.allowed_extensions) {
      const baseName = step.outputs.art_resource.replace(/\.[^/.]+$/, '');
      const oldRes = join(stage0Dir, `${baseName}${fileExt}`);
      if (existsSync(oldRes)) unlinkSync(oldRes);
      const publicBase = step.outputs.art_public.replace(/\.[^/.]+$/, '');
      const oldPub = join(publicDir, `${publicBase}${fileExt}`);
      if (existsSync(oldPub)) unlinkSync(oldPub);
    }

    writeFileSync(resourceArt, croppedBuffer);
    writeFileSync(publicArt, croppedBuffer);

    const pickResCutout = join(stage0Dir, `step-1-art-pick-${pick}-cutout.png`);
    const activeResCutout = join(stage0Dir, 'step-1-art-cutout.png');
    const activePubCutout = join(publicDir, 'art-cutout.png');
    if (existsSync(pickResCutout)) {
      copyFileSync(pickResCutout, activeResCutout);
      copyFileSync(pickResCutout, activePubCutout);
    } else {
      if (existsSync(activeResCutout)) unlinkSync(activeResCutout);
      if (existsSync(activePubCutout)) unlinkSync(activePubCutout);
    }

    const totalPicks = columns * rows;
    for (let p = 1; p <= totalPicks; p++) {
      const pResPattern = step.outputs.art_pick_resource_pattern.replace('{pick}', String(p));
      const pPubPattern = step.outputs.art_pick_public_pattern.replace('{pick}', String(p));
      const pResPath = join(stage0Dir, pResPattern);
      const pPubPath = join(publicDir, pPubPattern);
      const pBuffer = p === pick ? croppedBuffer : await ImageCropper.cropCell({ imageBuffer: sheetBuffer, columns, rows, pickIndex: p, quality });
      writeFileSync(pResPath, pBuffer);
      writeFileSync(pPubPath, pBuffer);
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const completedMsg = step.messages.completed
      .replace('{pick}', String(pick))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m`);
    ProgressHub.report(name, this.stepId, completedMsg);
    const contract = step.manifest_contract;

    ManifestManager.writeStepResult(name, this.stepId, {
      status: contract.status,
      seconds: duration,
      costUsd: contract.costUsd,
      costNote: contract.costNote,
      data: {
        chosenPick: pick,
        artSize: croppedBuffer.length,
      },
    });

    return {
      name,
      pick,
      resourceArtPath: resourceArt,
      publicArtPath: step.outputs.public_url_pattern.replace('{model}', name),
    };
  }
}
