import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageCropper } from '../common/image-cropper.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export interface PickAlternativeRequest {
  readonly name: string;
  readonly pick: number;
}

export interface PickAlternativeResponse {
  readonly name: string;
  readonly pick: number;
  readonly resourceArtPath: string;
  readonly publicArtPath: string;
}

export class AlternativePicker {
  private static readonly stepId = 's0-step-2';
  private static readonly extensions = ['.jpeg', '.jpg', '.png', '.webp'];

  private static findSheet(folder: string): string | null {
    for (const ext of this.extensions) {
      const candidate1 = join(folder, `step-1-alternatives${ext}`);
      if (existsSync(candidate1)) return candidate1;
      const candidate2 = join(folder, `alternatives${ext}`);
      if (existsSync(candidate2)) return candidate2;
    }
    return null;
  }

  public static async execute(request: PickAlternativeRequest): Promise<PickAlternativeResponse> {
    const { name, pick } = request;
    const step = PipelineConfigLoader.getStep(this.stepId);
    const params = step.parameters ?? {};
    const columns = params.columns ?? 3;
    const rows = params.rows ?? 2;
    const quality = (params.jpeg_quality ?? 95) / 100;

    const stage0Dir = join(WorkspacePaths.resourcePath(name), 'stage-0');
    const publicDir = WorkspacePaths.modelPath(name);

    const sheetPath = this.findSheet(stage0Dir) || this.findSheet(publicDir);
    if (!sheetPath) {
      throw new Error(`Alternatives sheet not found for '${name}'`);
    }

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

    const resourceArt = join(stage0Dir, 'step-1-art.jpeg');
    const publicArt = join(publicDir, 'art.jpeg');

    for (const fileExt of ['.jpeg', '.jpg', '.png', '.webp']) {
      const oldRes = join(stage0Dir, `step-1-art${fileExt}`);
      if (existsSync(oldRes)) unlinkSync(oldRes);
      const oldPub = join(publicDir, `art${fileExt}`);
      if (existsSync(oldPub)) unlinkSync(oldPub);
    }

    writeFileSync(resourceArt, croppedBuffer);
    writeFileSync(publicArt, croppedBuffer);

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    ManifestManager.writeStepResult(name, this.stepId, {
      status: 'DONE',
      seconds: duration,
      costUsd: 0,
      data: {
        chosenPick: pick,
        artSize: croppedBuffer.length,
      },
    });

    return {
      name,
      pick,
      resourceArtPath: resourceArt,
      publicArtPath: `/models/${name}/art.jpeg`,
    };
  }
}
