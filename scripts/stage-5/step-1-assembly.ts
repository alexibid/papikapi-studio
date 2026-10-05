import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import { AssemblyBuilder } from './assembly-builder.js';
import { FaceColourAssigner } from './face-colour-assigner.js';
import { GlbColourReader } from './glb-colour-reader.js';
import type {
  AssemblySource,
  AssemblyStepDefinition,
  Stage5Response,
} from './interfaces/assembly.interface.js';

const MM_PER_METRE = 1000;

export class AssemblyGenerator {
  private static readonly stepId = 's5-step-1';

  public static async execute(modelName: string): Promise<Stage5Response> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AssemblyStepDefinition;
    const resourceDir = WorkspacePaths.resourcePath(modelName);
    const stageDir = join(resourceDir, step.stage_dir);
    const publicDir = WorkspacePaths.modelPath(modelName);
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    const startMessage = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMessage}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMessage);

    const start = Date.now();
    const source = JSON.parse(
      readFileSync(join(resourceDir, step.inputs.stage_dir, step.inputs.net_resource), 'utf8'),
    ) as AssemblySource;
    const triangles = await GlbColourReader.read(
      join(resourceDir, step.inputs.texture_stage_dir, step.inputs.texture_model),
      source.meshScale * MM_PER_METRE,
    );
    const colours = FaceColourAssigner.assign(AssemblyBuilder.faceGeometries(source), triangles);
    const document = AssemblyBuilder.compose(
      source,
      AssemblyBuilder.faceGeometries(source),
      colours,
      step.parameters,
    );

    const outputPath = join(stageDir, step.outputs.assembly_resource);
    writeFileSync(outputPath, JSON.stringify(document));
    copyFileSync(outputPath, join(publicDir, step.outputs.assembly_public));
    const seconds = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const completedMessage = step.messages.completed
      .replace('{model}', modelName)
      .replace('{pieces}', String(document.checks.pieces))
      .replace('{hinges}', String(document.checks.hinges))
      .replace('{duration}', String(seconds));
    console.log(`  \x1b[32m${completedMessage}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMessage);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: { ...document.checks },
      data: { source: join(step.inputs.stage_dir, step.inputs.net_resource) },
    });

    return { name: modelName, outputPath, seconds };
  }
}
