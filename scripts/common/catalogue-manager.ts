import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogueModelEntry } from './interfaces/index.js';
import { PipelineConfigLoader } from './pipeline-config.js';
import { WorkspacePaths } from './workspace-paths.js';

export class CatalogueManager {
  public static sync(): readonly CatalogueModelEntry[] {
    if (!existsSync(WorkspacePaths.publicModelsDir)) {
      return [];
    }

    const step2 = PipelineConfigLoader.getStep('s1-step-2');
    const step3 = PipelineConfigLoader.getStep('s2-step-2');
    const glbFilename = step3.outputs.model_public;
    const artFilename = step2.outputs.art_public;

    const entries = readdirSync(WorkspacePaths.publicModelsDir, { withFileTypes: true });
    const verifiedModels: CatalogueModelEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.startsWith('.')) {
        continue;
      }

      const modelId = entry.name;
      const modelDir = join(WorkspacePaths.publicModelsDir, modelId);
      const glbPath = join(modelDir, glbFilename);
      const artPath = join(modelDir, artFilename);

      if (
        existsSync(glbPath) &&
        existsSync(artPath) &&
        statSync(glbPath).size > 1000
      ) {
        verifiedModels.push({
          id: modelId,
          model: glbFilename,
          preview: artFilename,
          image: artFilename,
        });
      }
    }

    verifiedModels.sort((a, b) => a.id.localeCompare(b.id));

    writeFileSync(
      WorkspacePaths.indexFile,
      `${JSON.stringify(verifiedModels, null, 1)}\n`,
      'utf8',
    );

    return verifiedModels;
  }
}

if (process.argv[1] && process.argv[1].endsWith('catalogue-manager.ts')) {
  const models = CatalogueManager.sync();
  console.log(`Synced catalogue with ${models.length} verified model(s): ${models.map((m) => m.id).join(', ')}`);
}
