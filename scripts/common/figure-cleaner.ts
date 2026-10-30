import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineStep } from './interfaces/index.js';
import { PipelineConfigLoader } from './pipeline-config.js';
import { WorkspacePaths } from './workspace-paths.js';

const STEP_NUMBER = /^s\d+-step-(\d+)$/;
const PUBLIC_KEY = /_public$/;
const PUBLIC_PATTERN_KEY = /_public_pattern$/;

/**
 * A figure rebuilt from a step keeps nothing that step or any later one produced: a run from the first step
 * starts from an empty figure in resources and public, a run from a later step drops that step's files and
 * every later stage, so no output of an older run sits next to the new ones.
 */
export class FigureCleaner {
  public static cleanFrom(model: string, firstStep: PipelineStep): readonly string[] {
    const steps = PipelineConfigLoader.load().pipeline_stages.flatMap((stage) => stage.steps);
    const index = steps.findIndex((step) => step.id === firstStep.id);
    if (index <= 0) return this.removeFigure(model);
    return [
      ...steps.slice(index).flatMap((step) => this.removeStepResources(model, step)),
      ...steps.slice(index).flatMap((step) => this.removeStepPublic(model, step)),
    ];
  }

  private static removeFigure(model: string): readonly string[] {
    return [...this.remove(WorkspacePaths.resourcePath(model)), ...this.remove(WorkspacePaths.modelPath(model))];
  }

  private static removeStepResources(model: string, step: PipelineStep): readonly string[] {
    const number = STEP_NUMBER.exec(step.id)?.[1];
    const outputs: Record<string, unknown> = step.outputs;
    const stageDir = typeof outputs.stage_dir === 'string' ? outputs.stage_dir : step.stage_dir;
    const directory = WorkspacePaths.stageResourceDir(model, stageDir);
    if (number === undefined || !existsSync(directory)) return [];
    const prefix = new RegExp(`^step-${number}[-.]`);
    return readdirSync(directory)
      .filter((name) => prefix.test(name))
      .flatMap((name) => this.remove(join(directory, name)));
  }

  private static removeStepPublic(model: string, step: PipelineStep): readonly string[] {
    const directory = WorkspacePaths.modelPath(model);
    if (!existsSync(directory)) return [];
    const outputs: Record<string, unknown> = step.outputs;
    const names = Object.entries(outputs)
      .filter(([key, value]) => typeof value === 'string' && (PUBLIC_KEY.test(key) || PUBLIC_PATTERN_KEY.test(key)))
      .map(([, value]) => this.publicName(String(value)));
    return readdirSync(directory)
      .filter((file) => names.some((name) => name.test(file)))
      .flatMap((file) => this.remove(join(directory, file)));
  }

  private static publicName(value: string): RegExp {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{pick\\}', '\\d+');
    return new RegExp(`^${escaped}$`);
  }

  private static remove(path: string): readonly string[] {
    if (!existsSync(path)) return [];
    rmSync(path, { recursive: true, force: true });
    return [path];
  }
}
