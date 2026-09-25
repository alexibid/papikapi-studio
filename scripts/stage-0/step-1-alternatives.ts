import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiClient, InlineImage } from '../common/gemini-client.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { RunPodClient } from '../common/runpod-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

interface AlternativesStepOutputs {
  readonly sheet_resource: string;
  readonly sheet_public: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
}

interface AlternativesServerlessConfig {
  readonly env_endpoint_key: string;
  readonly container_image: string;
  readonly api_url_pattern: string;
  readonly async_url_pattern: string;
  readonly status_url_pattern: string;
}

interface AlternativesManifestContract {
  readonly status: string;
  readonly costUsd: number;
  readonly costNote: string;
}

interface AlternativesStepParameters {
  readonly default_model: string;
  readonly fallback_model: string;
  readonly inference_engine: string;
  readonly aspect_ratio: string;
  readonly columns: number;
  readonly rows: number;
  readonly alternatives_count: number;
  readonly max_reference_images: number;
  readonly system_prompt: string;
  readonly negative_prompt: string;
  readonly prompt_templates: {
    readonly specific_subject: string;
    readonly generic_category: string;
  };
  readonly reference_note_template: string;
  readonly maturity_descriptions: readonly string[];
  readonly critical_rules: readonly string[];
}

interface AlternativesStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly serverless?: AlternativesServerlessConfig;
  readonly parameters: AlternativesStepParameters;
  readonly outputs: AlternativesStepOutputs;
  readonly manifest_contract: AlternativesManifestContract;
}

export interface GenerateAlternativesRequest {
  readonly name: string;
  readonly prompt: string;
  readonly referenceImages?: readonly InlineImage[];
  readonly engineOverride?: string;
}

export interface GenerateAlternativesResponse {
  readonly name: string;
  readonly prompt: string;
  readonly resourcePath: string;
  readonly publicPath: string;
  readonly seconds: number;
  readonly costUsd: number;
}

export class AlternativesGenerator {
  private static readonly stepId = 's0-step-1';

  public static composePrompt(subject: string, referenceCount: number): { system: string; prompt: string; aspectRatio: string; model: string } {
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

    const refInstruction = referenceCount > 0 && params.reference_note_template
      ? params.reference_note_template.replace('{count}', String(referenceCount))
      : '';

    const maturity = !isGeneric && params.maturity_descriptions
      ? `\n\nMATURITY PROGRESSION (ROW BY ROW):\n${params.maturity_descriptions.join('\n')}`
      : '';

    const critical = params.critical_rules
      ? `\n\nCRITICAL RULES:\n${params.critical_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : '';

    const prompt = template
      .replace('{subject}', subject)
      .replace('{reference_instruction}', refInstruction)
      + maturity
      + critical;

    const system = params.system_prompt;
    const aspectRatio = params.aspect_ratio;
    const model = params.default_model;

    return { system, prompt, aspectRatio, model };
  }

  public static async execute(request: GenerateAlternativesRequest): Promise<GenerateAlternativesResponse> {
    const { name, prompt, referenceImages = [], engineOverride } = request;
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AlternativesStepDefinition;
    const params = step.parameters;
    const { system, prompt: fullPrompt, aspectRatio, model: defaultModel } = this.composePrompt(prompt, referenceImages.length);

    const engine = engineOverride ? engineOverride : defaultModel;
    const isGemini = engine.toLowerCase().includes('gemini');

    let imageBytes: Buffer;
    let mime: string;
    let seconds: number;

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
    } else {
      const envKey = step.serverless ? step.serverless.env_endpoint_key : 'RUNPOD_FLUX_ENDPOINT_ID';
      const endpointId = RunPodClient.getEndpointId(envKey);

      const payload = {
        prompt: fullPrompt,
        negative_prompt: params.negative_prompt,
        reference_images: referenceImages.map((img) => img.data),
        columns: params.columns,
        rows: params.rows,
      };

      const result = await RunPodClient.execute<typeof payload, { sheet_base64: string; mime?: string }>(
        endpointId,
        payload
      );
      imageBytes = Buffer.from(result.output.sheet_base64, 'base64');
      mime = result.output.mime ? result.output.mime : 'image/jpeg';
      seconds = result.seconds;
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

    const contract = step.manifest_contract;
    const config = PipelineConfigLoader.load();
    const pricing = config.pricing as { runpod_flux_usd_per_sec?: number; flux_models?: Record<string, number> };
    const fluxRate = pricing.runpod_flux_usd_per_sec ? pricing.runpod_flux_usd_per_sec : 0.00015;
    const costUsd = !isGemini
      ? Math.round(seconds * fluxRate * 10000) / 10000
      : (pricing.flux_models && pricing.flux_models[engine] !== undefined
        ? pricing.flux_models[engine]
        : contract.costUsd);

    const costNote = !isGemini
      ? `RunPod Serverless FLUX.2 ($${costUsd.toFixed(4)})`
      : contract.costNote;

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
