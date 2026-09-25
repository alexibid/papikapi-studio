import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipelineConfigLoader } from './pipeline-config.js';

export class WorkspacePaths {
  private static readonly here = dirname(fileURLToPath(import.meta.url));
  public static readonly appRoot = resolve(WorkspacePaths.here, '../..');
  public static readonly workspaceRoot = resolve(WorkspacePaths.appRoot, '../..');
  public static readonly pipelineFile = join(WorkspacePaths.appRoot, 'pipeline.json');
  public static readonly envFile = join(WorkspacePaths.appRoot, '.env');

  public static get resourcesDir(): string {
    const config = PipelineConfigLoader.load();
    return join(WorkspacePaths.appRoot, config.workspace.resources_dir);
  }

  public static get publicModelsDir(): string {
    const config = PipelineConfigLoader.load();
    return join(WorkspacePaths.appRoot, config.workspace.models_dir);
  }

  public static get indexFile(): string {
    return join(WorkspacePaths.publicModelsDir, 'index.json');
  }

  public static resourcePath(subject: string): string {
    return join(WorkspacePaths.resourcesDir, subject);
  }

  public static modelPath(subject: string): string {
    return join(WorkspacePaths.publicModelsDir, subject);
  }

  public static stageResourceDir(subject: string, stageDir: string): string {
    return join(WorkspacePaths.resourcePath(subject), stageDir);
  }
}
