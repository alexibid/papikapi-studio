import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { CatalogueManager } from './common/catalogue-manager.js';
import { FigurePublisher } from './common/figure-publisher.js';
import { CliArgsParser } from './common/cli-args-parser.js';
import { GeminiClient } from './common/gemini-client.js';
import type {
  InlineImage,
  ModelExecutionReport,
  PipelineStep,
  StepExecutionResult,
} from './common/interfaces/index.js';
import { ModelRow } from './common/model-row.js';
import { OutputCleaner } from './common/output-cleaner.js';
import { PipelineConfigLoader } from './common/pipeline-config.js';
import { QuietConsole } from './common/quiet-console.js';
import { StageReporter } from './common/stage-reporter.js';
import { StepInputs } from './common/step-inputs.js';
import { WorkspacePaths } from './common/workspace-paths.js';
import type { CliArguments } from './orchestrator.interface.js';
import { AlternativesGenerator } from './stage-1/step-1-alternatives.js';
import { AlternativePicker } from './stage-1/step-2-pick.js';
import { CutoutGenerator } from './stage-2/step-1-cutout.js';
import { TrellisGenerator } from './stage-2/step-2-trellis.js';
import { BaseCutGenerator } from './stage-2/step-3-base.js';
import { SimplifyGenerator } from './stage-3/step-1-simplify.js';
import { TexturizeGenerator } from './stage-3/step-2-texturize.js';
import { PlinthGenerator } from './stage-3/step-3-plinth.js';
import { UnfoldGenerator } from './stage-4/step-1-unfold.js';
import { SheetsExporter } from './stage-4/step-2-sheets.js';
import { AssemblyGenerator } from './stage-5/step-1-assembly.js';

export class StageOrchestrator {
  private static discoverModels(pattern: string): readonly string[] {
    const position = pattern.split('/').indexOf('*');
    const matches = globSync(pattern, { cwd: WorkspacePaths.appRoot });
    const names = matches.map((m) => m.split('/')[position]);
    return [...new Set(names)].sort();
  }

  private static resolveTargetModels(
    flags: CliArguments,
    activeSteps: readonly PipelineStep[],
  ): readonly string[] {
    if (flags.model) return [flags.model.trim()];
    const config = PipelineConfigLoader.load();
    const pattern = activeSteps[0]?.models_from ?? config.workspace.models_from;
    return this.discoverModels(pattern);
  }

  public static async run(): Promise<void> {
    const flags = CliArgsParser.parse();
    const targetStages =
      flags.stage !== null
        ? [PipelineConfigLoader.getStage(flags.stage)]
        : PipelineConfigLoader.load().pipeline_stages;
    const allSteps = targetStages.flatMap((s) => s.steps);
    let activeSteps: readonly PipelineStep[];
    if (flags.step) {
      activeSteps = allSteps.filter((s) => s.id === flags.step);
    } else if (flags.fromStep) {
      const idx = allSteps.findIndex((s) => s.id === flags.fromStep);
      if (idx === -1) {
        throw new Error(`Step '${flags.fromStep}' not found in pipeline`);
      }
      activeSteps = allSteps.slice(idx);
    } else {
      activeSteps = allSteps;
    }

    if (activeSteps.length === 0) {
      throw new Error(`No matching steps found for stage ${flags.stage} and step ${flags.step ?? flags.fromStep}`);
    }

    const stageTitle =
      targetStages.length > 1
        ? targetStages.map((s) => s.stage).join(' → ')
        : targetStages[0].stage;

    const models = this.resolveTargetModels(flags, activeSteps);
    StageReporter.printHeader(stageTitle, models.length);

    const reports: ModelExecutionReport[] = [];

    for (let mIdx = 0; mIdx < models.length; mIdx++) {
      const model = models[mIdx];
      const stepResults: StepExecutionResult[] = [];
      let modelPassed = true;
      const modelStart = Date.now();

      const label = `[${String(mIdx + 1).padStart(2, '0')}/${String(models.length).padStart(2, '0')}] ${model.toUpperCase()}`;
      const row = new ModelRow(label);
      let failureLines: readonly string[] = [];
      row.begin();

      for (const step of activeSteps) {
        const [reason] = StepInputs.skipReasons(model, step, flags);
        if (reason !== undefined) {
          stepResults.push({
            stepId: step.id,
            label: step.label,
            status: 'SKIP',
            duration: 0,
            message: reason,
          });
          row.finish(step.label, 'SKIP', 0);
          continue;
        }
        row.running(step.label);
        QuietConsole.start();
        OutputCleaner.clean(model, step);
        const stepStart = Date.now();
        let status: 'DONE' | 'FAIL' = 'DONE';
        let errMsg = '';

        try {
          if (step.id === 's1-step-1') {
            const promptFromFlag = flags.prompt;
            const defaultSubjectPrompt = model === 't-rex' ? 't-rex' : model.replace(/-/g, ' ');
            const defaultPrompt = promptFromFlag !== null ? promptFromFlag : defaultSubjectPrompt;
            console.log(`  [s1-step-1] Input Prompt: "${defaultPrompt}"`);
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
              console.log(
                `  [s1-step-1] Visual Reference: ${refPath} (${mime}, ${(bytes.length / 1024).toFixed(1)} KB)`,
              );
            }
            const res = await AlternativesGenerator.execute({
              name: model,
              prompt: defaultPrompt,
              referenceImages,
            });
            const size = statSync(res.resourcePath).size;
            console.log(
              `  [s1-step-1] Output Sheet: ${res.resourcePath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's1-step-2') {
            const pickStep = PipelineConfigLoader.getStep('s1-step-2');
            const defaultPick = (pickStep.parameters as { default_pick: number }).default_pick;
            const pick = flags.pick !== null ? flags.pick : defaultPick;
            const res = await AlternativePicker.execute({
              name: model,
              pick,
            });
            const size = statSync(res.resourceArtPath).size;
            console.log(
              `  [s1-step-2] Output Art: ${res.resourceArtPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's2-step-1') {
            const cutoutStep = PipelineConfigLoader.getStep('s2-step-1') as unknown as {
              inputs: { stage_dir: string; art_resource: string };
            };
            const artPath = join(
              WorkspacePaths.resourcePath(model),
              cutoutStep.inputs.stage_dir,
              cutoutStep.inputs.art_resource,
            );
            const artSize = existsSync(artPath) ? statSync(artPath).size : 0;
            console.log(`  [s2-step-1] Input Art: ${artPath} (${(artSize / 1024).toFixed(1)} KB)`);
            const res = await CutoutGenerator.execute(
              model,
              flags.pick !== null ? flags.pick : undefined,
            );
            const size = statSync(res.outputPath).size;
            console.log(
              `  [s2-step-1] Output Cutout: ${res.outputPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's2-step-2') {
            const trellisStep = PipelineConfigLoader.getStep('s2-step-2') as unknown as {
              inputs: { stage_dir: string; cutout_resource: string };
            };
            const cutoutPath = join(
              WorkspacePaths.resourcePath(model),
              trellisStep.inputs.stage_dir,
              trellisStep.inputs.cutout_resource,
            );
            const cutoutSize = existsSync(cutoutPath) ? statSync(cutoutPath).size : 0;
            console.log(
              `  [s2-step-2] Input Cutout: ${cutoutPath} (${(cutoutSize / 1024).toFixed(1)} KB)`,
            );
            const res = await TrellisGenerator.execute(
              model,
              flags.pick !== null ? flags.pick : undefined,
            );
            const size = statSync(res.outputPath).size;
            console.log(
              `  [s2-step-2] Output 3D Mesh: ${res.outputPath} (${(size / (1024 * 1024)).toFixed(2)} MB)`,
            );
            CatalogueManager.sync();
          } else if (step.id === 's2-step-3') {
            const res = await BaseCutGenerator.execute(
              model,
              flags.pick !== null ? flags.pick : undefined,
            );
            const size = statSync(res.modelPath).size;
            console.log(
              `  [s2-step-3] Output Figure Without Base: ${res.modelPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's3-step-1') {
            const res = await SimplifyGenerator.execute(
              model,
              flags.pick !== null ? flags.pick : undefined,
            );
            const size = statSync(res.meshPath).size;
            console.log(
              `  [s3-step-1] Output Simplified Mesh: ${res.pointsPath} and ${res.meshPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's3-step-2') {
            const res = await TexturizeGenerator.execute(
              model,
              flags.pick !== null ? flags.pick : undefined,
            );
            const size = statSync(res.modelPath).size;
            console.log(
              `  [s3-step-2] Output Textured Model: ${res.modelPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's3-step-3') {
            const res = await PlinthGenerator.execute(model);
            const size = statSync(res.modelPath).size;
            console.log(
              `  [s3-step-3] Output Model With Plinth: ${res.modelPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's4-step-1') {
            const res = await UnfoldGenerator.execute(model);
            const size = statSync(res.outputPath).size;
            console.log(
              `  [s4-step-1] Output Net: ${res.outputPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's4-step-2') {
            const res = await SheetsExporter.execute(model);
            const size = statSync(res.outputPath).size;
            console.log(
              `  [s4-step-2] Output Sheets: ${res.outputPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          } else if (step.id === 's5-step-1') {
            const res = await AssemblyGenerator.execute(model);
            const size = statSync(res.outputPath).size;
            console.log(
              `  [s5-step-1] Output Assembly Plan: ${res.outputPath} (${(size / 1024).toFixed(1)} KB)`,
            );
          }
        } catch (err) {
          status = 'FAIL';
          modelPassed = false;
          errMsg = (err as Error).message;
          console.error(`  ❌ Step error: ${errMsg}`);
        }

        const captured = QuietConsole.stop();
        const duration = (Date.now() - stepStart) / 1000;
        stepResults.push({
          stepId: step.id,
          label: step.label,
          status,
          duration,
          message: errMsg,
        });

        row.finish(step.label, status, duration);
        if (!modelPassed) {
          failureLines = captured;
          break;
        }
      }

      const totalDuration = (Date.now() - modelStart) / 1000;
      row.end(totalDuration, modelPassed, failureLines);
      if (modelPassed) FigurePublisher.publishQuietly(model);
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
