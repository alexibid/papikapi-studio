import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AlternativesStepDefinition,
  FluxWorkerOutput,
  GenerateAlternativesRequest,
  GenerateAlternativesResponse,
} from './stage-1.interface.js';
import type { InlineImage } from '../common/interfaces/index.js';
import { GeminiClient } from '../common/gemini-client.js';
import { TrainingReferences } from '../common/training-references.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { RunPodClient } from '../common/runpod-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import { PromptEnricher } from '../common/prompt-enricher.js';
import { PromptGuard } from '../common/prompt-guard.js';

export class AlternativesGenerator {
  private static readonly stepId = 's1-step-1';

  private static describeWorker(output: FluxWorkerOutput): string {
    if (output.reference_images_used === undefined) {
      return 'outdated image (no LoRA support, references ignored)';
    }
    const lora = output.lora ? `LoRA ${output.lora}` : 'no LoRA';
    return `${lora} · ${output.reference_images_used} reference image(s) used`;
  }

  private static loadStep(): AlternativesStepDefinition {
    return PipelineConfigLoader.getStep(this.stepId) as unknown as AlternativesStepDefinition;
  }

  public static composePrompt(subject: string, referenceCount: number): string {
    const params = this.loadStep().parameters;
    const reference = referenceCount > 0 ? `${params.reference_rule} ` : '';
    const pose = PromptEnricher.describesPose(subject) ? '' : `${params.default_pose} `;
    const system = params.system_prompt.replaceAll(
      '{plane_colour}',
      PromptEnricher.contrastingColour(subject, params.plane_colours),
    );
    const prompt = `${reference}${pose}${subject}. ${system}`;
    return PromptGuard.assertSystemBlock(PromptGuard.assertPrompt(prompt));
  }

  public static buildCellPrompts(subject: string, referenceCount: number): string[] {
    const prompt = this.composePrompt(subject, referenceCount);
    return Array.from({ length: this.loadStep().parameters.alternatives_count }, () => prompt);
  }

  private static composeReferenceImages(
    request: GenerateAlternativesRequest,
    maxSubjectImages: number,
  ): readonly InlineImage[] {
    const subjectImages = (request.referenceImages ?? []).slice(0, maxSubjectImages);
    // When the user provides subject photos, use only their photos to prevent style and feature contamination.
    // Style reference is only used when generating from text prompt alone (0 subject photos).
    const style = subjectImages.length === 0
      ? TrainingReferences.findStyleImage(request.name, request.prompt)
      : null;
    if (style) {
      const styleMessage = `🎨 Style Reference: ${style.item.file} (${style.item.name} in ${style.item.group})`;
      console.log(`  [s1-step-1] ${styleMessage}`);
      ProgressHub.report(request.name, this.stepId, styleMessage);
    }
    const subjectMessage = `📷 Subject Photos: ${subjectImages.length}`;
    console.log(`  [s1-step-1] ${subjectMessage}`);
    ProgressHub.report(request.name, this.stepId, subjectMessage);
    return style ? [style.image, ...subjectImages] : subjectImages;
  }

  private static saveReferences(stageDir: string, references: readonly InlineImage[]): void {
    references.forEach((image, index) => {
      const extension = image.mime.includes('png') ? 'png' : 'jpeg';
      writeFileSync(join(stageDir, `step-1-reference-${index + 1}.${extension}`), image.bytes);
    });
  }

  public static async execute(request: GenerateAlternativesRequest): Promise<GenerateAlternativesResponse> {
    const { name, prompt: rawPrompt, engineOverride } = request;
    const prompt = PromptGuard.assertSubject(PromptEnricher.subjectFrom(rawPrompt));
    const step = this.loadStep();
    const params = step.parameters;
    const referenceImages = this.composeReferenceImages({ ...request, prompt }, params.max_reference_images);
    const fullPrompt = this.composePrompt(prompt, referenceImages.length);

    const engine = engineOverride ? engineOverride : params.default_model;
    const isGemini = engine.toLowerCase().includes('gemini');

    let imageBytes: Buffer;
    let mime: string;
    let seconds: number;
    let costUsd: number;
    let costNote: string;

    const contract = step.manifest_contract;
    const config = PipelineConfigLoader.load();
    const pricing = config.pricing as { runpod_flux_usd_per_sec?: number; flux_models?: Record<string, number> };
    const fluxRate = pricing.runpod_flux_usd_per_sec ? pricing.runpod_flux_usd_per_sec : 0.00015;

    try {
      if (isGemini) {
        const result = await GeminiClient.generate(engine, {
          system: params.system_prompt,
          prompt,
          referenceImages,
          aspectRatio: params.aspect_ratio,
        });
        imageBytes = result.bytes;
        mime = result.mime;
        seconds = result.seconds;
        costUsd = pricing.flux_models && pricing.flux_models[engine] !== undefined
          ? pricing.flux_models[engine]
          : contract.costUsd;
        costNote = contract.costNote;
      } else {
        const envKey = step.serverless ? step.serverless.env_endpoint_key : 'RUNPOD_FLUX_ENDPOINT_ID';
        const endpointId = RunPodClient.getEndpointId(envKey);

        const payload = {
          prompt: fullPrompt,
          cell_prompts: this.buildCellPrompts(prompt, referenceImages.length),
          reference_images: referenceImages.map((img) => img.bytes.toString('base64')),
          columns: params.columns,
          rows: params.rows,
        };

        const startMsg = step.messages?.start ? step.messages.start.replace('{model}', name) : `[Stage 1: Step 1] Generating 3x2 alternatives sheet for ${name}`;
        console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
        ProgressHub.report(name, this.stepId, startMsg);

        const result = await RunPodClient.execute<typeof payload, FluxWorkerOutput>(
          endpointId,
          payload,
          {
            timeoutMs: 300000,
            purgeBeforeRun: true,
            maxRetries: 0,
            onProgress: (update) => {
              const state = update.status === 'IN_QUEUE' ? 'Na fila de espera' : 'A processar';
              const progressMsg = `⟳ [RunPod Serverless] Generating alternatives on FLUX.2 Serverless Worker... (${state}, ${update.elapsedSeconds}s elapsed)`;
              process.stdout.write(`\r  \x1b[36m${progressMsg}\x1b[0m`);
              ProgressHub.report(name, this.stepId, progressMsg);
            },
          }
        );
        process.stdout.write('\r\x1b[K');
        const workerMessage = `🧩 Worker: ${this.describeWorker(result.output)}`;
        console.log(`  [${this.stepId}] ${workerMessage}`);
        ProgressHub.report(name, this.stepId, workerMessage);
        imageBytes = Buffer.from(result.output.sheet_base64, 'base64');
        mime = result.output.mime ? result.output.mime : 'image/jpeg';
        seconds = result.seconds;
        costUsd = Math.round(seconds * fluxRate * 10000) / 10000;
        costNote = `RunPod Serverless FLUX.2 ($${costUsd.toFixed(4)})`;
      }
    } catch (err) {
      process.stdout.write('\r\x1b[K');
      const errMessage = (err as Error).message;
      console.error(`  \x1b[31m[${this.stepId}] ❌ Generation failed: ${errMessage}\x1b[0m`);
      throw new Error(`Falha na geração FLUX: ${errMessage}`);
    }

    const stage0Dir = join(WorkspacePaths.resourcePath(name), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(name);
    mkdirSync(stage0Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const ext = mime.includes('png') ? 'png' : 'jpeg';
    const resourceFile = join(stage0Dir, step.outputs.sheet_resource.replace(/\.[^/.]+$/, `.${ext}`));
    const publicFile = join(publicDir, step.outputs.sheet_public.replace(/\.[^/.]+$/, `.${ext}`));

    for (const fileExt of step.outputs.allowed_extensions) {
      const resBase = step.outputs.sheet_resource.replace(/\.[^/.]+$/, '');
      const oldRes = join(stage0Dir, `${resBase}${fileExt}`);
      if (existsSync(oldRes)) unlinkSync(oldRes);
      const pubBase = step.outputs.sheet_public.replace(/\.[^/.]+$/, '');
      const oldPub = join(publicDir, `${pubBase}${fileExt}`);
      if (existsSync(oldPub)) unlinkSync(oldPub);
    }

    writeFileSync(resourceFile, imageBytes);
    writeFileSync(publicFile, imageBytes);
    this.saveReferences(stage0Dir, referenceImages);

    ManifestManager.writeStepResult(name, this.stepId, {
      status: contract.status,
      seconds,
      costUsd,
      costNote,
      data: {
        prompt,
        fluxPrompt: fullPrompt,
        referenceCount: referenceImages.length,
        alternativesCount: params.alternatives_count,
        format: mime,
      },
    });

    return {
      name,
      prompt,
      resourcePath: resourceFile,
      publicPath: step.outputs.public_url_pattern.replace('{model}', name).replace(/\.[^/.]+$/, `.${ext}`),
      seconds,
      costUsd,
    };
  }
}
