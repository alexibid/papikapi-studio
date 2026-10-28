import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { CliArguments } from '../orchestrator.interface.js';
import type { PipelineStep } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

const RESOURCE_SUFFIX = /_resource$/;
const FALLBACK_PREFIX = 'fallback_';

export class StepInputs {
  public static skipReasons(
    model: string,
    step: PipelineStep,
    flags: CliArguments,
  ): readonly string[] {
    const absent = this.missing(model, step, flags.pick);
    if (absent.length > 0) return [`missing input: ${absent.join(', ')}`];
    if (this.skipsExisting(step, flags) && this.outputsPresent(model, step)) {
      if (!this.isStale(model, step, flags.pick)) {
        return ['outputs already exist'];
      }
    }
    return [];
  }

  private static skipsExisting(step: PipelineStep, flags: CliArguments): boolean {
    if (flags.force) return false;
    if (step.skip_if_outputs_exist === true) return flags.step !== step.id;
    return flags.stage === null && flags.step === null && flags.fromStep === null;
  }

  public static missing(model: string, step: PipelineStep, pick: number | null): readonly string[] {
    const inputs: Record<string, unknown> = step.inputs ?? {};
    const defaultDirectory = this.directoryOf(model, step, inputs);
    const extensions = this.allowedExtensions(inputs);

    return this.resourceNames(inputs)
      .filter(({ key, name }) => {
        const directory = this.directoryForResource(model, step, inputs, key);
        const candidates = [name, ...this.pickVariant(inputs, key, pick), ...this.fallbackOf(inputs, key)];
        if (candidates.some((candidate) => this.present(directory, candidate, extensions))) {
          return false;
        }
        const fallbacks = [
          defaultDirectory,
          WorkspacePaths.stageResourceDir(model, 'stage-2'),
          WorkspacePaths.stageResourceDir(model, 'stage-3'),
        ];
        return !fallbacks.some((dir) => candidates.some((candidate) => this.present(dir, candidate, extensions)));
      })
      .map(({ name }) => name);
  }

  private static directoryForResource(
    model: string,
    step: PipelineStep,
    inputs: Record<string, unknown>,
    key: string,
  ): string {
    const prefix = key.replace(RESOURCE_SUFFIX, '');
    const specificStageDir = inputs[`${prefix}_stage_dir`];
    if (typeof specificStageDir === 'string') {
      return WorkspacePaths.stageResourceDir(model, specificStageDir);
    }
    return this.directoryOf(model, step, inputs);
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
      .filter((key) => RESOURCE_SUFFIX.test(key) && !key.startsWith(FALLBACK_PREFIX))
      .map((key) => ({ key, name: String(section[key]) }));
  }

  /** `fallback_<x>_resource` is accepted when `<x>_resource` does not exist (older figures). */
  private static fallbackOf(inputs: Record<string, unknown>, key: string): readonly string[] {
    const fallback = inputs[`${FALLBACK_PREFIX}${key}`];
    return typeof fallback === 'string' ? [fallback] : [];
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
    return this.findExistingPath(directory, name, extensions) !== null;
  }

  private static findExistingPath(
    directory: string,
    name: string,
    extensions: readonly string[],
  ): string | null {
    const base = name.slice(0, name.length - extname(name).length);
    const names = [name, ...extensions.map((extension) => `${base}${extension}`)];
    for (const cand of names) {
      const p = join(directory, cand);
      if (existsSync(p)) return p;
    }
    return null;
  }

  public static isStale(
    model: string,
    step: PipelineStep,
    pick: number | null,
  ): boolean {
    const inputs: Record<string, unknown> = step.inputs ?? {};
    const outputs: Record<string, unknown> = step.outputs ?? {};
    const defaultDirectory = this.directoryOf(model, step, inputs);
    const outputDirectory = this.directoryOf(model, step, outputs);
    const inExtensions = this.allowedExtensions(inputs);
    const outExtensions = this.allowedExtensions(outputs);

    let newestInputMtime = 0;
    for (const { key, name } of this.resourceNames(inputs)) {
      const directory = this.directoryForResource(model, step, inputs, key);
      const candidates = [name, ...this.pickVariant(inputs, key, pick), ...this.fallbackOf(inputs, key)];
      for (const cand of candidates) {
        const found =
          this.findExistingPath(directory, cand, inExtensions) ??
          this.findExistingPath(defaultDirectory, cand, inExtensions) ??
          this.findExistingPath(WorkspacePaths.stageResourceDir(model, 'stage-2'), cand, inExtensions) ??
          this.findExistingPath(WorkspacePaths.stageResourceDir(model, 'stage-3'), cand, inExtensions);
        if (found) {
          try {
            const mtime = statSync(found).mtimeMs;
            if (mtime > newestInputMtime) newestInputMtime = mtime;
          } catch {}
        }
      }
    }

    if (newestInputMtime === 0) return false;

    let oldestOutputMtime = Infinity;
    const outputNames = this.resourceNames(outputs);
    for (const { name } of outputNames) {
      const found = this.findExistingPath(outputDirectory, name, outExtensions);
      if (!found) return true;
      try {
        const mtime = statSync(found).mtimeMs;
        if (mtime < oldestOutputMtime) oldestOutputMtime = mtime;
      } catch {
        return true;
      }
    }

    return newestInputMtime > oldestOutputMtime;
  }
}
