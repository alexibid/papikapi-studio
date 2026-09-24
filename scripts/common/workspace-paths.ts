import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class WorkspacePaths {
  private static readonly here = dirname(fileURLToPath(import.meta.url));
  public static readonly appRoot = resolve(WorkspacePaths.here, '../..');
  public static readonly workspaceRoot = resolve(WorkspacePaths.appRoot, '../..');
  public static readonly resourcesDir = join(WorkspacePaths.appRoot, 'resources');
  public static readonly publicModelsDir = join(WorkspacePaths.appRoot, 'public', 'models');
  public static readonly pipelineFile = join(WorkspacePaths.appRoot, 'pipeline.json');
  public static readonly envFile = join(WorkspacePaths.appRoot, '.env');
  public static readonly indexFile = join(WorkspacePaths.publicModelsDir, 'index.json');

  public static resourcePath(subject: string): string {
    return join(WorkspacePaths.resourcesDir, subject);
  }

  public static modelPath(subject: string): string {
    return join(WorkspacePaths.publicModelsDir, subject);
  }
}
