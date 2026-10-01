import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StepRecord } from './interfaces/index.js';
import { PipelineConfigLoader } from './pipeline-config.js';
import { WorkspacePaths } from './workspace-paths.js';

export class StepDurationEstimator {
  public static expectedSeconds(stepId: string): number {
    const observed = this.averageObservedSeconds(stepId);
    return observed ?? PipelineConfigLoader.getStep(stepId).expected_seconds;
  }

  private static averageObservedSeconds(stepId: string): number | null {
    const step = PipelineConfigLoader.getStep(stepId) as unknown as { stage_dir: string; outputs?: { manifest?: string } };
    const manifestName = step.outputs?.manifest ? step.outputs.manifest : `${stepId.replace(/^s\d+-/, '')}-manifest.json`;
    const resourcesDir = WorkspacePaths.resourcesDir;
    if (!existsSync(resourcesDir)) return null;

    const durations: number[] = [];
    for (const modelDir of readdirSync(resourcesDir, { withFileTypes: true })) {
      if (!modelDir.isDirectory()) continue;
      const manifestPath = join(resourcesDir, modelDir.name, step.stage_dir, manifestName);
      if (!existsSync(manifestPath)) continue;

      try {
        const record = JSON.parse(readFileSync(manifestPath, 'utf8')) as StepRecord;
        const wasCached = Boolean((record.data as { cached?: boolean } | undefined)?.cached);
        if (!wasCached && record.seconds > 0) durations.push(record.seconds);
      } catch {
        continue;
      }
    }

    if (durations.length === 0) return null;
    return Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length);
  }
}
