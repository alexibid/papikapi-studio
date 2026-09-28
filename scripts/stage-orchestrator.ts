import { existsSync, globSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { CliArguments } from './orchestrator.interface.js';
import type {
  InlineImage,
  ModelExecutionReport,
  PipelineStep,
  StepExecutionResult,
} from './common/interfaces/index.js';
import { CatalogueManager } from './common/catalogue-manager.js';
import { GeminiClient } from './common/gemini-client.js';
import { PipelineConfigLoader } from './common/pipeline-config.js';
import { StageReporter } from './common/stage-reporter.js';
import { WorkspacePaths } from './common/workspace-paths.js';
import { AlternativesGenerator } from './stage-0/step-1-alternatives.js';
import { AlternativePicker } from './stage-0/step-2-pick.js';
import { CutoutGenerator } from './stage-1/step-1-cutout.js';
import { TrellisGenerator } from './stage-1/step-2-trellis.js';

export class StageOrchestrator {
  private static parseCliArgs(): CliArguments {
    const rawArgs = process.argv.slice(2);
    const args: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      const a = rawArgs[i];
      if (a === '--args' && rawArgs[i + 1] !== undefined) {
        args.push(...rawArgs[++i].split(/\s+/).filter(Boolean));
      } else if (a.startsWith('--args=')) {
        args.push(...a.slice('--args='.length).split(/\s+/).filter(Boolean));
      } else {
        args.push(a);
      }
    }
    const flags: CliArguments = { stage: 1, step: null, model: null, pick: null, prompt: null, ref: null };

    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--stage' && args[i + 1] !== undefined) flags.stage = Number.parseInt(args[++i], 10);
      else if (a.startsWith('--stage=')) flags.stage = Number.parseInt(a.split('=')[1], 10);
      else if (a === '--step' && args[i + 1] !== undefined) flags.step = args[++i];
      else if (a.startsWith('--step=')) flags.step = a.split('=')[1];
      else if ((a === '--model' ? true : a === '--subject') && args[i + 1] !== undefined) flags.model = args[++i];
      else if (a.startsWith('--model=') ? true : a.startsWith('--subject=')) flags.model = a.split('=')[1];
      else if (a === '--pick' && args[i + 1] !== undefined) flags.pick = Number.parseInt(args[++i], 10);
      else if (a.startsWith('--pick=')) flags.pick = Number.parseInt(a.split('=')[1], 10);
      else if (a === '--prompt' && args[i + 1] !== undefined) flags.prompt = args[++i];
      else if (a.startsWith('--prompt=')) flags.prompt = a.split('=')[1];
      else if (a === '--ref' && args[i + 1] !== undefined) flags.ref = args[++i];
      else if (a.startsWith('--ref=')) flags.ref = a.split('=')[1];
      else if (!a.startsWith('-') && !flags.model) flags.model = a;
    }
    return flags;
  }

  private static discoverModels(pattern: string): readonly string[] {
    const position = pattern.split('/').indexOf('*');
    const matches = globSync(pattern, { cwd: WorkspacePaths.appRoot });
    const names = matches.map((m) => m.split('/')[position]);
    return [...new Set(names)].sort();
  }

  private static resolveTargetModels(flags: CliArguments, activeSteps: readonly PipelineStep[]): readonly string[] {
    if (flags.model) return [flags.model.trim()];
    const config = PipelineConfigLoader.load();
    const pattern = activeSteps[0]?.models_from ?? config.workspace.models_from;
    return this.discoverModels(pattern);
  }

  private static cleanOutputs(model: string, step: PipelineStep): void {
    const resourceDir = WorkspacePaths.resourcePath(model);
    const publicDir = WorkspacePaths.modelPath(model);
    const stageDir = join(resourceDir, step.stage_dir);
    const cleaned: string[] = [];

    if (step.id === 's0-step-1') {
      const stepOutputs = step.outputs as unknown as { allowed_extensions: string[]; sheet_resource: string; sheet_public: string; manifest: string };
      for (const ext of stepOutputs.allowed_extensions) {
        const resBase = stepOutputs.sheet_resource.replace(/\.[^/.]+$/, '');
        const resAlt = join(stageDir, `${resBase}${ext}`);
        if (existsSync(resAlt)) { unlinkSync(resAlt); cleaned.push(basename(resAlt)); }
        const pubBase = stepOutputs.sheet_public.replace(/\.[^/.]+$/, '');
        const pubAlt = join(publicDir, `${pubBase}${ext}`);
        if (existsSync(pubAlt)) { unlinkSync(pubAlt); cleaned.push(`public/${basename(pubAlt)}`); }
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) { unlinkSync(manifest); cleaned.push(basename(manifest)); }
    } else if (step.id === 's0-step-2') {
      const stepOutputs = step.outputs as unknown as { allowed_extensions: string[]; art_resource: string; art_public: string; manifest: string };
      for (const ext of stepOutputs.allowed_extensions) {
        const resBase = stepOutputs.art_resource.replace(/\.[^/.]+$/, '');
        const resArt = join(stageDir, `${resBase}${ext}`);
        if (existsSync(resArt)) { unlinkSync(resArt); cleaned.push(basename(resArt)); }
        const pubBase = stepOutputs.art_public.replace(/\.[^/.]+$/, '');
        const pubArt = join(publicDir, `${pubBase}${ext}`);
        if (existsSync(pubArt)) { unlinkSync(pubArt); cleaned.push(`public/${basename(pubArt)}`); }
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) { unlinkSync(manifest); cleaned.push(basename(manifest)); }
    } else if (step.id === 's1-step-1') {
      const stepOutputs = step.outputs as { cutout_resource: string; cutout_public: string; manifest: string };
      const resCutout = join(stageDir, stepOutputs.cutout_resource);
      if (existsSync(resCutout)) { unlinkSync(resCutout); cleaned.push(basename(resCutout)); }
      const pubCutout = join(publicDir, stepOutputs.cutout_public);
      if (existsSync(pubCutout)) { unlinkSync(pubCutout); cleaned.push(`public/${basename(pubCutout)}`); }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) { unlinkSync(manifest); cleaned.push(basename(manifest)); }
    } else if (step.id === 's1-step-2') {
      const stepOutputs = step.outputs as { model_resource: string; model_public: string; manifest: string };
      const resModel = join(stageDir, stepOutputs.model_resource);
      if (existsSync(resModel)) { unlinkSync(resModel); cleaned.push(basename(resModel)); }
      const pubModel = join(publicDir, stepOutputs.model_public);
      if (existsSync(pubModel)) { unlinkSync(pubModel); cleaned.push(`public/${basename(pubModel)}`); }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) { unlinkSync(manifest); cleaned.push(basename(manifest)); }
    }

    if (cleaned.length > 0) {
      console.log(`  \x1b[90m🧹 [Pre-Clean]\x1b[0m Purged ${cleaned.length} previous output file(s): ${cleaned.join(', ')}`);
    }
  }

  public static async run(): Promise<void> {
    const flags = this.parseCliArgs();
    const stage = PipelineConfigLoader.getStage(flags.stage);
    const activeSteps = flags.step
      ? stage.steps.filter((s) => s.id === flags.step)
      : stage.steps;

    if (activeSteps.length === 0) {
      throw new Error(`No matching steps found for stage ${flags.stage} and step ${flags.step}`);
    }

    const models = this.resolveTargetModels(flags, activeSteps);
    StageReporter.printHeader(stage.stage, models.length);

    const reports: ModelExecutionReport[] = [];

    for (let mIdx = 0; mIdx < models.length; mIdx++) {
      const model = models[mIdx];
      const stepResults: StepExecutionResult[] = [];
      let modelPassed = true;
      const modelStart = Date.now();

      const label = `[${String(mIdx + 1).padStart(2, '0')}/${String(models.length).padStart(2, '0')}] ${model.toUpperCase()}`;
      console.log(`━━ ${label.padEnd(58, ' ')} [ START ]`);

      for (const step of activeSteps) {
        this.cleanOutputs(model, step);
        const stepStart = Date.now();
        let status: 'DONE' | 'FAIL' = 'DONE';
        let errMsg = '';

        try {
          if (step.id === 's0-step-1') {
            const promptFromFlag = flags.prompt;
            const defaultSubjectPrompt = model === 't-rex' ? 't-rex' : model.replace(/-/g, ' ');
            const defaultPrompt = promptFromFlag !== null ? promptFromFlag : defaultSubjectPrompt;
            console.log(`  [s0-step-1] Input Prompt: "${defaultPrompt}"`);
            let referenceImages: InlineImage[] | undefined;
            if (flags.ref) {
              const candidates = [
                isAbsolute(flags.ref) ? flags.ref : resolve(process.cwd(), flags.ref),
                resolve(WorkspacePaths.workspaceRoot, flags.ref),
                resolve(WorkspacePaths.appRoot, flags.ref),
              ];
              const refPath = candidates.find((c) => existsSync(c));
              if (!refPath) {
                throw new Error(`Reference image not found: ${flags.ref}`);
              }
              const bytes = readFileSync(refPath);
              const mime = GeminiClient.sniffMime(bytes);
              referenceImages = [{ bytes, mime }];
              console.log(`  [s0-step-1] Visual Reference: ${refPath} (${mime}, ${(bytes.length / 1024).toFixed(1)} KB)`);
            }
            const res = await AlternativesGenerator.execute({
              name: model,
              prompt: defaultPrompt,
              referenceImages,
            });
            const size = statSync(res.resourcePath).size;
            console.log(`  [s0-step-1] Output Sheet: ${res.resourcePath} (${(size / 1024).toFixed(1)} KB)`);
          } else if (step.id === 's0-step-2') {
            const pickStep = PipelineConfigLoader.getStep('s0-step-2');
            const defaultPick = (pickStep.parameters as { default_pick: number }).default_pick;
            const pick = flags.pick !== null ? flags.pick : defaultPick;
            const res = await AlternativePicker.execute({
              name: model,
              pick,
            });
            const size = statSync(res.resourceArtPath).size;
            console.log(`  [s0-step-2] Output Art: ${res.resourceArtPath} (${(size / 1024).toFixed(1)} KB)`);
          } else if (step.id === 's1-step-1') {
            const cutoutStep = PipelineConfigLoader.getStep('s1-step-1') as unknown as { inputs: { stage_dir: string; art_resource: string } };
            const artPath = join(WorkspacePaths.resourcePath(model), cutoutStep.inputs.stage_dir, cutoutStep.inputs.art_resource);
            const artSize = existsSync(artPath) ? statSync(artPath).size : 0;
            console.log(`  [s1-step-1] Input Art: ${artPath} (${(artSize / 1024).toFixed(1)} KB)`);
            const res = await CutoutGenerator.execute(model, flags.pick !== null ? flags.pick : undefined);
            const size = statSync(res.outputPath).size;
            console.log(`  [s1-step-1] Output Cutout: ${res.outputPath} (${(size / 1024).toFixed(1)} KB)`);
          } else if (step.id === 's1-step-2') {
            const trellisStep = PipelineConfigLoader.getStep('s1-step-2') as unknown as { inputs: { stage_dir: string; cutout_resource: string } };
            const cutoutPath = join(WorkspacePaths.resourcePath(model), trellisStep.inputs.stage_dir, trellisStep.inputs.cutout_resource);
            const cutoutSize = existsSync(cutoutPath) ? statSync(cutoutPath).size : 0;
            console.log(`  [s1-step-2] Input Cutout: ${cutoutPath} (${(cutoutSize / 1024).toFixed(1)} KB)`);
            const res = await TrellisGenerator.execute(model, flags.pick !== null ? flags.pick : undefined);
            const size = statSync(res.outputPath).size;
            console.log(`  [s1-step-2] Output 3D Mesh: ${res.outputPath} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
            CatalogueManager.sync();
          }
        } catch (err) {
          status = 'FAIL';
          modelPassed = false;
          errMsg = (err as Error).message;
          console.error(`  ❌ Step error: ${errMsg}`);
        }

        const duration = (Date.now() - stepStart) / 1000;
        stepResults.push({
          stepId: step.id,
          label: step.label,
          status,
          duration,
          message: errMsg,
        });

        StageReporter.printStepCard(step.label, status, duration);
        if (!modelPassed) break;
      }

      const totalDuration = (Date.now() - modelStart) / 1000;
      reports.push({
        modelName: model,
        stepResults,
        totalDuration,
        passed: modelPassed,
      });
    }

    StageReporter.printSummary(reports);
  }
}

if (process.argv[1] && process.argv[1].endsWith('stage-orchestrator.ts')) {
  void StageOrchestrator.run().catch((err) => {
    console.error(`\n[Fatal Error] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
