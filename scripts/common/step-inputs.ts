import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { CliArguments } from '../stage-orchestrator.interface.js';
import type { PipelineStep } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

const RESOURCE_SUFFIX = /_resource$/;

export class StepInputs {
  public static skipReasons(
    model: string,
    step: PipelineStep,
    flags: CliArguments,
  ): readonly string[] {
    const absent = this.missing(model, step, flags.pick);
    if (absent.length > 0) return [`missing input: ${absent.join(', ')}`];
    if (this.skipsExisting(step, flags) && this.outputsPresent(model, step))
      return ['outputs already exist'];
    return [];
  }

  private static skipsExisting(step: PipelineStep, flags: CliArguments): boolean {
    if (step.skip_if_outputs_exist === true) return flags.step !== step.id;
    return flags.stage === null && flags.step === null;
  }

  public static missing(model: string, step: PipelineStep, pick: number | null): readonly string[] {
    const inputs: Record<string, unknown> = step.inputs ?? {};
    const directory = this.directoryOf(model, step, inputs);
    const extensions = this.allowedExtensions(inputs);

    return this.resourceNames(inputs)
      .filter(({ key, name }) => {
        const candidates = [name, ...this.pickVariant(inputs, key, pick)];
        return !candidates.some((candidate) => this.present(directory, candidate, extensions));
      })
      .map(({ name }) => name);
  }

  public static outputsPresent(model: string, step: PipelineStep): boolean {
    const outputs: Record<string, unknown> = step.outputs;
    const directory = this.directoryOf(model, step, outputs);
    const extensions = this.allowedExtensions(outputs);
    const names = this.resourceNames(outputs);
    return names.length > 0 && names.every(({ name }) => this.present(directory, name, extensions));
  }

  private static directoryOf(
    model: string,
    step: PipelineStep,
    section: Record<string, unknown>,
  ): string {
    const stageDir = typeof section.stage_dir === 'string' ? section.stage_dir : step.stage_dir;
    return WorkspacePaths.stageResourceDir(model, stageDir);
  }

  private static resourceNames(
    section: Record<string, unknown>,
  ): readonly { key: string; name: string }[] {
    return Object.keys(section)
      .filter((key) => RESOURCE_SUFFIX.test(key))
      .map((key) => ({ key, name: String(section[key]) }));
  }

  private static allowedExtensions(section: Record<string, unknown>): readonly string[] {
    const value = section.allowed_extensions;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private static pickVariant(
    inputs: Record<string, unknown>,
    key: string,
    pick: number | null,
  ): readonly string[] {
    if (pick === null) return [];
    const pattern = inputs[key.replace(RESOURCE_SUFFIX, '_pick_resource_pattern')];
    return typeof pattern === 'string' ? [pattern.replace('{pick}', String(pick))] : [];
  }

  private static present(directory: string, name: string, extensions: readonly string[]): boolean {
    const base = name.slice(0, name.length - extname(name).length);
    const names = [name, ...extensions.map((extension) => `${base}${extension}`)];
    return names.some((candidate) => existsSync(join(directory, candidate)));
  }
}
