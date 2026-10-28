import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlinthTrimmer } from '../../common/glb/plinth-trimmer.js';
import { PipelineConfigLoader } from '../../common/pipeline-config.js';
import type { PlinthParameters } from '../../common/glb/glb.interface.js';

interface TrellisStepParameters {
  readonly plinth: PlinthParameters;
}

export class TrellisTrim {
  public static async run(directory: string, labels: readonly string[]): Promise<void> {
    const step = PipelineConfigLoader.getStep('s2-step-2') as unknown as { parameters: TrellisStepParameters };
    for (const label of labels) {
      const trimmed = await PlinthTrimmer.apply(readFileSync(join(directory, `${label}.glb`)), step.parameters.plinth);
      writeFileSync(join(directory, `${label}-trimmed.glb`), trimmed.glb);
      console.log(`${label}: trimmed=${trimmed.trimmed} faces=${trimmed.faceCount} openEdges=${trimmed.openEdges} nonManifold=${trimmed.nonManifoldEdges}`);
    }
  }
}

await TrellisTrim.run(process.argv[2], process.argv.slice(3));
