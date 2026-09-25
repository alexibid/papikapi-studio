import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageCropper } from '../common/image-cropper.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

interface PickStepInputs {
  readonly sheet_resource_prefix: string;
  readonly sheet_public_prefix: string;
  readonly allowed_extensions: readonly string[];
}

interface PickStepOutputs {
  readonly stage_dir: string;
  readonly art_resource: string;
  readonly art_public: string;
  readonly art_pick_resource_pattern: string;
  readonly art_pick_public_pattern: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
}

interface PickManifestContract {
  readonly status: string;
  readonly costUsd: number;
  readonly costNote: string;
}

interface PickStepParameters {
  readonly default_pick: number;
  readonly jpeg_quality: number;
  readonly columns: number;
  readonly rows: number;
}

interface PickStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly inputs: PickStepInputs;
  readonly outputs: PickStepOutputs;
  readonly parameters: PickStepParameters;
  readonly manifest_contract: PickManifestContract;
}

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

    const resPattern = step.outputs.art_pick_resource_pattern.replace('{pick}', String(pick));
    const pubPattern = step.outputs.art_pick_public_pattern.replace('{pick}', String(pick));
    const resourceArtPick = join(stage0Dir, resPattern);
    const publicArtPick = join(publicDir, pubPattern);
    writeFileSync(resourceArtPick, croppedBuffer);
    writeFileSync(publicArtPick, croppedBuffer);

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
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
