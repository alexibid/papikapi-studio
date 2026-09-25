import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspacePaths } from './workspace-paths.js';

export interface CatalogueModelEntry {
  readonly id: string;
  readonly model: string;
  readonly preview: string;
  readonly image: string;
}

export class CatalogueManager {
  public static sync(): readonly CatalogueModelEntry[] {
    if (!existsSync(WorkspacePaths.publicModelsDir)) {
      return [];
    }

    const entries = readdirSync(WorkspacePaths.publicModelsDir, { withFileTypes: true });
    const verifiedModels: CatalogueModelEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const modelId = entry.name;
      const modelDir = join(WorkspacePaths.publicModelsDir, modelId);
      const glbPath = join(modelDir, 'model.glb');
      const artPath = join(modelDir, 'art.jpeg');

      if (
        existsSync(glbPath) &&
        existsSync(artPath) &&
        statSync(glbPath).size > 1000
      ) {
        verifiedModels.push({
          id: modelId,
          model: 'model.glb',
          preview: 'art.jpeg',
          image: 'art.jpeg',
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
