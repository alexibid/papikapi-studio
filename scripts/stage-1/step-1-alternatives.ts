import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AlternativesStepDefinition,
  AlternativesStepParameters,
  FluxWorkerOutput,
  GenerateAlternativesRequest,
  GenerateAlternativesResponse,
  ReferenceComposition,
} from './stage-1.interface.js';
import type { InlineImage } from '../common/interfaces/index.js';
import { GeminiClient } from '../common/gemini-client.js';
import { TrainingReferences } from '../common/training-references.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { RunPodClient } from '../common/runpod-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export class AlternativesGenerator {
  private static readonly stepId = 's1-step-1';

  private static describeWorker(output: FluxWorkerOutput): string {
    if (output.reference_images_used === undefined) {
      return 'outdated image (no LoRA support, references ignored)';
    }
    const lora = output.lora ? `LoRA ${output.lora}` : 'no LoRA';
    return `${lora} · ${output.reference_images_used} reference image(s) used`;
  }

  private static loadParameters(): AlternativesStepParameters {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AlternativesStepDefinition;
    return step.parameters;
  }

  private static getTrainingReferencePrompt(modelName: string): string | null {
    const metaPath = join(process.cwd(), 'apps/papikapi-studio/scripts/training/references/metadata.jsonl');
    const altMetaPath = join(process.cwd(), 'scripts/training/references/metadata.jsonl');
    const targetPath = existsSync(metaPath) ? metaPath : existsSync(altMetaPath) ? altMetaPath : null;
    if (!targetPath) return null;

    try {
      const content = readFileSync(targetPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        const item = JSON.parse(line) as { file_name: string; text: string };
        const baseName = item.file_name.replace(/\.[^/.]+$/, '').split('/').pop();
        if (baseName === modelName) {
          return item.text
            .replace(/papikapi-style\s+/g, '')
            .replace(this.loadParameters().training_caption_view_phrase, '');
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  public static composePrompt(subject: string, references: ReferenceComposition, modelName?: string): { system: string; prompt: string; aspectRatio: string; model: string } {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AlternativesStepDefinition;
    const params = step.parameters;
    const templates = params.prompt_templates;

    const isGeneric = Boolean(
      subject.toLowerCase().startsWith('category:')
        ? true
        : subject.toLowerCase().includes('list of')
          ? true
          : subject.toLowerCase().includes('animals of')
    );
    const template = isGeneric ? templates.generic_category : templates.specific_subject;

    const refInstruction = this.composeReferenceInstruction(params, references);

    const maturity = !isGeneric && params.maturity_descriptions
      ? `\n\nMATURITY PROGRESSION (ROW BY ROW):\n${params.maturity_descriptions.join('\n')}`
      : '';

    const critical = params.critical_rules
      ? `\n\nCRITICAL RULES:\n${params.critical_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : '';

    const trainingPrompt = modelName ? this.getTrainingReferencePrompt(modelName) : null;
    const effectiveSubject = trainingPrompt
      ? `${subject} (${trainingPrompt})`
      : subject;

    const prompt = template
      .replace('{subject}', effectiveSubject)
      .replace('{reference_instruction}', refInstruction)
      + maturity
      + critical;

    const system = params.system_prompt;
    const aspectRatio = params.aspect_ratio;
    const model = params.default_model;

    return { system, prompt, aspectRatio, model };
  }

  private static composeReferenceInstruction(params: AlternativesStepParameters, references: ReferenceComposition): string {
    const styleNote = references.hasStyle ? params.style_reference_note : '';
    const firstSubjectIndex = references.hasStyle ? 2 : 1;
    const subjectNote = references.subjectCount > 0
      ? params.reference_note_template
        .replace('{count}', String(references.subjectCount))
        .replace('{first}', String(firstSubjectIndex))
      : '';
    return [styleNote, subjectNote].filter(Boolean).join(' ');
  }

  private static composeReferenceImages(request: GenerateAlternativesRequest, maxSubjectImages: number): {
    images: readonly InlineImage[];
    composition: ReferenceComposition;
  } {
    const subjectImages = (request.referenceImages ?? []).slice(0, maxSubjectImages);
    const style = TrainingReferences.findStyleImage(request.name, request.prompt);
    if (style) {
      const styleMessage = `🎨 Style Reference: ${style.item.file} (${style.item.name} in ${style.item.group})`;
      console.log(`  [s1-step-1] ${styleMessage}`);
      ProgressHub.report(request.name, this.stepId, styleMessage);
    }
    const subjectMessage = `📷 Subject Photos: ${subjectImages.length}`;
    console.log(`  [s1-step-1] ${subjectMessage}`);
    ProgressHub.report(request.name, this.stepId, subjectMessage);
    return {
      images: style ? [style.image, ...subjectImages] : subjectImages,
      composition: { hasStyle: style !== null, subjectCount: subjectImages.length },
    };
  }

  public static buildCellPrompts(name: string, subject: string): string[] {
    const params = this.loadParameters();
    const trainingPrompt = this.getTrainingReferencePrompt(name);
    const details = trainingPrompt ? trainingPrompt : subject;

    return params.cell_prompt_templates.map((template) =>
      template
        .replaceAll('{subject}', subject)
        .replaceAll('{details}', details)
        .replaceAll('{view}', params.view_clause)
        .replaceAll('{base}', params.base_clause),
    );
  }

  public static async execute(request: GenerateAlternativesRequest): Promise<GenerateAlternativesResponse> {
    const { name, prompt, engineOverride } = request;
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AlternativesStepDefinition;
    const params = step.parameters;
    const { images: referenceImages, composition } = this.composeReferenceImages(request, params.max_reference_images);
    const { system, prompt: fullPrompt, aspectRatio, model: defaultModel } = this.composePrompt(prompt, composition, name);

    const engine = engineOverride ? engineOverride : defaultModel;
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

    if (isGemini) {
      const result = await GeminiClient.generate(engine, {
        system,
        prompt: fullPrompt,
        referenceImages,
        aspectRatio,
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
        cell_prompts: this.buildCellPrompts(name, prompt),
        negative_prompt: params.negative_prompt,
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
          onProgress: (elapsed) => {
            const progressMsg = `⟳ [RunPod Serverless] Generating alternatives on FLUX.2 Serverless Worker... (${elapsed}s elapsed)`;
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

    ManifestManager.writeStepResult(name, this.stepId, {
      status: contract.status,
      seconds,
      costUsd,
      costNote,
      data: {
        prompt,
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
