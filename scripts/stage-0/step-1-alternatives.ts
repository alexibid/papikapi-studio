import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiClient, InlineImage } from '../common/gemini-client.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

interface AlternativesStepOutputs {
  readonly sheet_resource: string;
  readonly sheet_public: string;
  readonly public_url_pattern: string;
  readonly manifest: string;
  readonly allowed_extensions: readonly string[];
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
    const { system, prompt: fullPrompt, aspectRatio, model: defaultModel } = this.composePrompt(prompt, referenceImages.length);

    const engine = engineOverride ? engineOverride : defaultModel;
    const result = await GeminiClient.generate(engine, {
      system,
      prompt: fullPrompt,
      referenceImages,
      aspectRatio,
    });

    const stage0Dir = join(WorkspacePaths.resourcePath(name), step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(name);
    mkdirSync(stage0Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const ext = GeminiClient.mimeExtension(result.mime);
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

    writeFileSync(resourceFile, result.bytes);
    writeFileSync(publicFile, result.bytes);

    const contract = step.manifest_contract;
    const config = PipelineConfigLoader.load();
    const pricing = config.pricing as { flux_models?: Record<string, number> };
    const costUsd = pricing.flux_models && pricing.flux_models[engine] !== undefined
      ? pricing.flux_models[engine]
      : contract.costUsd;

    ManifestManager.writeStepResult(name, this.stepId, {
      status: contract.status,
      seconds: result.seconds,
      costUsd,
      costNote: contract.costNote,
      data: {
        prompt,
        referenceCount: referenceImages.length,
        alternativesCount: params.alternatives_count,
        format: result.mime,
      },
    });

    return {
      name,
      prompt,
      resourcePath: resourceFile,
      publicPath: step.outputs.public_url_pattern.replace('{model}', name).replace(/\.[^/.]+$/, `.${ext}`),
      seconds: result.seconds,
      costUsd,
    };
  }
}
