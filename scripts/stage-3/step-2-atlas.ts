import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { ProgressHub } from '../common/progress-hub.js';
import { PythonRunner } from '../common/python-runner.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  AtlasOutputs,
  AtlasResponse,
  AtlasStatistics,
  AtlasStepDefinition,
} from './interfaces/atlas.interface.js';

interface GroundedDocument {
  readonly groundOffset: readonly number[];
}

function isGroundedDocument(value: unknown): value is GroundedDocument {
  if (typeof value !== 'object' || value === null || !('groundOffset' in value)) return false;
  const offset = value.groundOffset;
  return Array.isArray(offset) && offset.length === 3 && offset.every((axis) => typeof axis === 'number');
}

export class AtlasGenerator {
  private static readonly stepId = 's3-step-2';

  private static groundOffset(pointsPath: string): readonly number[] {
    const document: unknown = JSON.parse(readFileSync(pointsPath, 'utf8'));
    if (!isGroundedDocument(document)) {
      throw new Error(`No ground offset in ${pointsPath}`);
    }
    return document.groundOffset;
  }

  private static resolveFile(candidates: readonly string[], description: string): string {
    const found = candidates.find((c) => existsSync(c));
    if (!found) {
      throw new Error(`${description} not found. Tried: ${candidates.join(', ')}`);
    }
    return found;
  }

  public static async execute(modelName: string): Promise<AtlasResponse> {
    const step = PipelineConfigLoader.getStep(this.stepId) as unknown as AtlasStepDefinition;
    const stageDir = join(WorkspacePaths.resourcePath(modelName), step.stage_dir);
    mkdirSync(stageDir, { recursive: true });

    const resourceDir = WorkspacePaths.resourcePath(modelName);
    const simpleCandidates = [
      join(stageDir, step.inputs.model_resource),
      join(stageDir, 'step-1-simplify.glb'),
    ];
    const simplePath = this.resolveFile(simpleCandidates, 'Simplified mesh');

    const pointsCandidates = [
      join(stageDir, step.inputs.points_resource),
      join(stageDir, 'step-1-simplify.json'),
    ];
    const pointsPath = this.resolveFile(pointsCandidates, 'Points document');

    const detailedCandidates = [
      join(resourceDir, step.inputs.detailed_stage_dir, step.inputs.detailed_model_resource),
      join(resourceDir, 'stage-2', 'step-4-details.glb'),
      join(resourceDir, 'stage-2', 'step-3-base.glb'),
    ];
    const detailedPath = this.resolveFile(detailedCandidates, 'Detailed model');

    const atlasPath = join(stageDir, step.outputs.atlas_resource);
    const uvPath = join(stageDir, step.outputs.uv_resource);
    const tempRawAtlas = join(tmpdir(), `${modelName}-raw-atlas-${Date.now()}.png`);

    const startMsg = step.messages.start.replace('{model}', modelName);
    console.log(`\n  \x1b[35m${startMsg}\x1b[0m`);
    ProgressHub.report(modelName, this.stepId, startMsg);

    const start = Date.now();
    const ground = this.groundOffset(pointsPath);

    // 1. Bake raw texture from detailed GLB to simple GLB UVs
    BlenderRunner.run(step.blender, step.blender.bake_script, {
      detailed_glb: detailedPath,
      simple_glb: simplePath,
      ground_offset: ground,
      output_png: tempRawAtlas,
      output_uv_json: uvPath,
      ...step.bake,
    });

    // 2. Clean and simplify atlas into palette
    const statistics = PythonRunner.run<AtlasStatistics>(step.atlas_script, {
      input_png: tempRawAtlas,
      uv_json: uvPath,
      output_png: atlasPath,
      ...step.atlas,
    });

    if (existsSync(tempRawAtlas)) {
      try {
        unlinkSync(tempRawAtlas);
      } catch {}
    }

    const duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;

    const completedMsg = step.messages.completed
      .replace('{model}', modelName)
      .replace('{families}', String(statistics.families.length))
      .replace('{duration}', String(duration));
    console.log(`  \x1b[32m${completedMsg}\x1b[0m\n`);
    ProgressHub.report(modelName, this.stepId, completedMsg);

    ManifestManager.writeStepResult(modelName, this.stepId, {
      status: step.manifest_contract.status,
      seconds: duration,
      costUsd: 0.0,
      costNote: step.manifest_contract.costNote,
      metrics: {
        colourFamilies: statistics.families.length,
        specksAbsorbed: statistics.specksAbsorbed,
        detailTexels: statistics.detailTexels,
        missedTexels: statistics.missedTexels,
      },
      data: {
        source: detailedPath,
        families: statistics.families,
        detailFamilies: statistics.detailFamilies,
        bake: step.bake,
        atlas: step.atlas,
      },
    });

    return { name: modelName, atlasPath, uvPath, seconds: duration };
  }
}
