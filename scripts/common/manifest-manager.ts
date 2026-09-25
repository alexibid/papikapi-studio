import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelManifest, StepRecord, StepRecordInput } from './interfaces/index.js';
import { PipelineConfigLoader } from './pipeline-config.js';
import { WorkspacePaths } from './workspace-paths.js';

export type { StepRecordInput, StepRecord, ModelManifest };

export class ManifestManager {
  private static readonly manifestVersion = 1;

  public static readStepResult(subject: string, stageId: string): StepRecord | null {
    const step = PipelineConfigLoader.getStep(stageId) as unknown as { stage_dir: string; outputs?: { manifest?: string } };
    const manifestName = step.outputs?.manifest ? step.outputs.manifest : `${stageId.replace(/^s\d+-/, '')}-manifest.json`;
    const targetFile = join(
      WorkspacePaths.resourcePath(subject),
      step.stage_dir,
      manifestName
    );
    if (!existsSync(targetFile)) return null;
    try {
      return JSON.parse(readFileSync(targetFile, 'utf8')) as StepRecord;
    } catch {
      return null;
    }
  }

  public static writeStepResult(
    subject: string,
    stageId: string,
    record: StepRecordInput
  ): ModelManifest {
    const step = PipelineConfigLoader.getStep(stageId) as unknown as { stage_dir: string; outputs?: { manifest?: string } };
    const targetDir = join(WorkspacePaths.resourcePath(subject), step.stage_dir);
    mkdirSync(targetDir, { recursive: true });

    const entry: StepRecord = {
      stageId,
      at: record.at ?? new Date().toISOString(),
      status: record.status,
      seconds: Math.round(record.seconds * 1000) / 1000,
      costUsd: record.costUsd,
      ...(record.costNote ? { costNote: record.costNote } : {}),
      ...(record.data ? { data: record.data } : {}),
      ...(record.metrics ? { metrics: record.metrics } : {}),
    };

    const manifestName = step.outputs?.manifest ? step.outputs.manifest : `${stageId.replace(/^s\d+-/, '')}-manifest.json`;
    const targetFile = join(targetDir, manifestName);
    writeFileSync(targetFile, `${JSON.stringify(entry, null, 2)}\n`);

    return this.buildAggregateManifest(subject);
  }

  public static buildAggregateManifest(subject: string): ModelManifest {
    const resDir = WorkspacePaths.resourcePath(subject);
    const pubDir = WorkspacePaths.modelPath(subject);
    const stages: Record<string, StepRecord> = {};

    if (existsSync(resDir)) {
      const dirs = readdirSync(resDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('stage-'))
        .map((d) => join(resDir, d.name));

      for (const d of dirs) {
        const files = readdirSync(d).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          try {
            const parsed = JSON.parse(readFileSync(join(d, file), 'utf8')) as StepRecord;
            if (parsed?.stageId) {
              stages[parsed.stageId] = parsed;
            }
          } catch {
            continue;
          }
        }
      }
    }

    const stageList = Object.values(stages);
    const totalSeconds = Math.round(stageList.reduce((acc, s) => acc + (s.seconds !== undefined ? s.seconds : 0), 0) * 1000) / 1000;
    const totalCostUsd = Math.round(stageList.reduce((acc, s) => acc + (s.costUsd !== undefined ? s.costUsd : 0), 0) * 10000) / 10000;

    const manifest: ModelManifest = {
      version: this.manifestVersion,
      subject,
      stages,
      totalSeconds,
      totalCostUsd,
      updatedAt: new Date().toISOString(),
    };

    mkdirSync(pubDir, { recursive: true });
    writeFileSync(join(pubDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  }
}
