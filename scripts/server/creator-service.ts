import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { InlineImage } from '../common/interfaces/index.js';
import { CatalogueManager } from '../common/catalogue-manager.js';
import { GeminiClient } from '../common/gemini-client.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import { AlternativesGenerator } from '../stage-1/step-1-alternatives.js';
import { AlternativePicker } from '../stage-1/step-2-pick.js';
import { CutoutGenerator } from '../stage-2/step-1-cutout.js';
import { TrellisGenerator } from '../stage-2/step-2-trellis.js';
import type {
  CreatorBuildResult,
  CreatorModelInfo,
  CreatorSheetFile,
} from './creator-service.interface.js';

export class CreatorService {
  public static cleanModelName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  }

  public static dataUrlToImage(dataUrl: string): InlineImage {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      const raw = Buffer.from(dataUrl, 'base64');
      return { bytes: raw, mime: 'image/jpeg' };
    }
    return {
      mime: match[1],
      bytes: Buffer.from(match[2], 'base64'),
    };
  }

  public static async generateAlternatives(
    name: string,
    prompt: string,
    images?: string[],
  ) {
    const cleanName = CreatorService.cleanModelName(name);
    const referenceImages = Array.isArray(images) && images.length > 0
      ? images.map((img) => CreatorService.dataUrlToImage(img))
      : [];

    ProgressHub.begin(cleanName, ['s1-step-1']);
    try {
      const result = await AlternativesGenerator.execute({
        name: cleanName,
        prompt,
        referenceImages,
      });
      ProgressHub.finish(cleanName);
      return result;
    } catch (err) {
      ProgressHub.fail(cleanName, (err as Error).message);
      throw err;
    }
  }

  public static async buildModel(
    name: string,
    pick: number,
  ): Promise<CreatorBuildResult> {
    const cleanName = CreatorService.cleanModelName(name);
    ProgressHub.begin(cleanName, ['s1-step-2', 's2-step-1', 's2-step-2']);
    try {
      const cropResult = await AlternativePicker.execute({ name: cleanName, pick });
      await CutoutGenerator.execute(cleanName, pick);
      const trellisResult = await TrellisGenerator.execute(cleanName, pick);
      CatalogueManager.sync();
      ProgressHub.finish(cleanName);
      return { cropResult, trellisResult };
    } catch (err) {
      ProgressHub.fail(cleanName, (err as Error).message);
      throw err;
    }
  }

  public static getSheet(name: string): CreatorSheetFile | null {
    const cleanName = CreatorService.cleanModelName(name);
    const step1 = PipelineConfigLoader.getStep('s1-step-1');
    const stage0Dir = join(WorkspacePaths.resourcePath(cleanName), step1.stage_dir);
    const publicDir = WorkspacePaths.modelPath(cleanName);

    const candidates: string[] = [];
    for (const ext of step1.outputs.allowed_extensions) {
      const resBase = step1.outputs.sheet_resource.replace(/\.[^/.]+$/, '');
      candidates.push(join(stage0Dir, `${resBase}${ext}`));
      const pubBase = step1.outputs.sheet_public.replace(/\.[^/.]+$/, '');
      candidates.push(join(publicDir, `${pubBase}${ext}`));
    }

    const sheetPath = candidates.find((p) => existsSync(p));
    if (!sheetPath) return null;

    const bytes = readFileSync(sheetPath);
    const mime = GeminiClient.sniffMime(bytes);
    return { bytes, mime };
  }

  public static getModelInfo(name: string): CreatorModelInfo {
    const cleanName = CreatorService.cleanModelName(name);
    const step1 = PipelineConfigLoader.getStep('s1-step-1');
    const step2 = PipelineConfigLoader.getStep('s1-step-2');
    const step3 = PipelineConfigLoader.getStep('s2-step-2');

    const stage0Dir = join(WorkspacePaths.resourcePath(cleanName), step1.stage_dir);
    const publicDir = WorkspacePaths.modelPath(cleanName);

    const candidates: string[] = [];
    for (const ext of step1.outputs.allowed_extensions) {
      const resBase = step1.outputs.sheet_resource.replace(/\.[^/.]+$/, '');
      candidates.push(join(stage0Dir, `${resBase}${ext}`));
      const pubBase = step1.outputs.sheet_public.replace(/\.[^/.]+$/, '');
      candidates.push(join(publicDir, `${pubBase}${ext}`));
    }
    const hasAlternatives = candidates.some((p) => existsSync(p));

    const cachedPicks: number[] = [];
    const alternativesCount = step1.parameters?.alternatives_count !== undefined
      ? Number(step1.parameters.alternatives_count)
      : 6;
    for (let p = 1; p <= alternativesCount; p++) {
      const pattern = step3.outputs.model_pick_public_pattern.replace('{pick}', String(p));
      const pubPickGlb = join(publicDir, pattern);
      if (existsSync(pubPickGlb) && statSync(pubPickGlb).size > 1000) {
        cachedPicks.push(p);
      }
    }

    let currentPick: number | null = null;
    const pubModel = join(publicDir, step3.outputs.model_public);
    const hasPubModel = existsSync(pubModel) && statSync(pubModel).size > 1000;

    const step2Manifest = join(stage0Dir, step2.outputs.manifest);
    if (existsSync(step2Manifest) && hasPubModel) {
      try {
        const parsed = JSON.parse(readFileSync(step2Manifest, 'utf-8'));
        if (parsed?.data?.chosenPick) {
          currentPick = Number(parsed.data.chosenPick);
          if (!cachedPicks.includes(currentPick)) {
            cachedPicks.push(currentPick);
          }
        }
      } catch {}
    }

    cachedPicks.sort((a, b) => a - b);

    return {
      name: cleanName,
      hasAlternatives,
      sheetUrl: hasAlternatives ? `/api/creator/sheet?name=${cleanName}` : null,
      cachedPicks,
      currentPick,
    };
  }

  public static deleteModel(name: string): string {
    const cleanName = CreatorService.cleanModelName(name);
    const resourceDir = WorkspacePaths.resourcePath(cleanName);
    const publicDir = WorkspacePaths.modelPath(cleanName);

    if (existsSync(resourceDir)) {
      rmSync(resourceDir, { recursive: true, force: true });
    }
    if (existsSync(publicDir)) {
      rmSync(publicDir, { recursive: true, force: true });
    }

    CatalogueManager.sync();
    return cleanName;
  }
}
