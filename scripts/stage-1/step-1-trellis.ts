import { existsSync, mkdirSync, openAsBlob, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export interface TrellisGenerateResponse {
  readonly name: string;
  readonly outputPath: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
}

export class TrellisGenerator {
  private static readonly stepId = 's1-step-1';
  private static readonly defaultEndpoint = 'https://nb2fo5r3psqvno-8888.proxy.runpod.net/generate';
  private static readonly defaultUsdPerSec = 0.00016;

  private static findInputArt(modelName: string): string {
    const stage0Dir = join(WorkspacePaths.resourcePath(modelName), 'stage-0');
    const extensions = ['.jpeg', '.jpg', '.png'];
    for (const ext of extensions) {
      const candidate = join(stage0Dir, `step-1-art${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    const publicCandidate = join(WorkspacePaths.modelPath(modelName), 'art.jpeg');
    if (existsSync(publicCandidate)) return publicCandidate;

    throw new Error(`Input art not found for model '${modelName}'`);
  }

  public static async execute(modelName: string): Promise<TrellisGenerateResponse> {
    const inputPath = this.findInputArt(modelName);
    const step = PipelineConfigLoader.getStep(this.stepId);
    const params = step.parameters ?? {};

    const stage1Dir = join(WorkspacePaths.resourcePath(modelName), 'stage-1');
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stage1Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const outputPath = join(stage1Dir, 'step-1-3d.glb');
    const publicPath = join(publicDir, 'model.glb');

    if (existsSync(outputPath)) unlinkSync(outputPath);
    if (existsSync(publicPath)) unlinkSync(publicPath);

    const endpoint = (params.endpoint as string) || this.defaultEndpoint;
    const seed = (params.seed as number) ?? 1;
    const simplify = (params.simplify as number) ?? 0.95;
    const textureSize = (params.texture_size as number) ?? 1024;

    const url = new URL(endpoint);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('simplify', String(simplify));
    url.searchParams.set('texture_size', String(textureSize));

    const fileBlob = await openAsBlob(inputPath);
    const formData = new FormData();
    formData.append('file', fileBlob, basename(inputPath));

    const startTime = Date.now();
    let elapsed = 0;
    const progressInterval = setInterval(() => {
      elapsed += 2;
      process.stdout.write(`\r  \x1b[36m⟳ [RunPod GPU]\x1b[0m Generating 3D Mesh on RTX PRO 4500 SE... (${elapsed}s elapsed)`);
    }, 2000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'POST',
        body: formData,
      });
    } finally {
      clearInterval(progressInterval);
      process.stdout.write('\r\x1b[K');
    }

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown server error');
      throw new Error(`TRELLIS API error (${response.status}): ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    writeFileSync(outputPath, buffer);
    writeFileSync(publicPath, buffer);

    const duration = Math.round(((Date.now() - startTime) / 1000) * 100) / 100;
    const costUsd = Math.round(duration * this.defaultUsdPerSec * 10000) / 10000;
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);

    console.log(`  \x1b[32m✔ [RunPod GPU]\x1b[0m 3D Model generated: ${sizeMb} MB in ${duration}s ($${costUsd.toFixed(4)})\n`);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: 'DONE',
      seconds: duration,
      costUsd,
      costNote: 'RunPod RTX PRO 4500 SE ($0.58/hr)',
      metrics: { fileSize: buffer.length },
      data: {
        fileSize: buffer.length,
        format: 'model/gltf-binary',
        device: 'NVIDIA RTX PRO 4500 Blackwell Server Edition',
        parameters: { seed, simplify, texture_size: textureSize },
      },
    });

    return {
      name: modelName,
      outputPath,
      publicPath: `/models/${modelName}/model.glb`,
      seconds: duration,
      costUsd,
    };
  }
}
