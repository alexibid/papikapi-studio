import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiClient, InlineImage } from '../common/gemini-client.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

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
    const step = PipelineConfigLoader.getStep(this.stepId);
    const params = step.parameters ?? {};
    const templates = params.prompt_templates ?? {
      specific_subject: '{subject}',
      generic_category: '{subject}',
    };

    const isGeneric = subject.toLowerCase().startsWith('category:') || subject.toLowerCase().includes('list of') || subject.toLowerCase().includes('animals of');
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

    const system = params.system_prompt ?? '';
    const aspectRatio = params.aspect_ratio ?? '3:2';
    const model = (params.default_model as string) ?? 'gemini-3.1-flash-image';

    return { system, prompt, aspectRatio, model };
  }

  public static async execute(request: GenerateAlternativesRequest): Promise<GenerateAlternativesResponse> {
    const { name, prompt, referenceImages = [], engineOverride } = request;
    const { system, prompt: fullPrompt, aspectRatio, model: defaultModel } = this.composePrompt(prompt, referenceImages.length);

    const engine = engineOverride || defaultModel;
    const result = await GeminiClient.generate(engine, {
      system,
      prompt: fullPrompt,
      referenceImages,
      aspectRatio,
    });

    const stage0Dir = join(WorkspacePaths.resourcePath(name), 'stage-0');
    const publicDir = WorkspacePaths.modelPath(name);
    mkdirSync(stage0Dir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const ext = GeminiClient.mimeExtension(result.mime);
    const resourceFile = join(stage0Dir, `step-1-alternatives.${ext}`);
    const publicFile = join(publicDir, `alternatives.${ext}`);

    for (const fileExt of ['.jpeg', '.jpg', '.png', '.webp']) {
      const oldRes = join(stage0Dir, `step-1-alternatives${fileExt}`);
      if (existsSync(oldRes)) unlinkSync(oldRes);
      const oldPub = join(publicDir, `alternatives${fileExt}`);
      if (existsSync(oldPub)) unlinkSync(oldPub);
    }

    writeFileSync(resourceFile, result.bytes);
    writeFileSync(publicFile, result.bytes);

    const costUsd = GeminiClient.prices[engine] ?? 0.02;

    ManifestManager.writeStepResult(name, this.stepId, {
      status: 'DONE',
      seconds: result.seconds,
      costUsd,
      data: {
        prompt,
        referenceCount: referenceImages.length,
        alternativesCount: 6,
        format: result.mime,
      },
    });

    return {
      name,
      prompt,
      resourcePath: resourceFile,
      publicPath: `/models/${name}/alternatives.${ext}`,
      seconds: result.seconds,
      costUsd,
    };
  }
}
