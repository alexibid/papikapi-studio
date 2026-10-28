import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspacePaths } from './workspace-paths.js';

export class PlinthCleaner2D {
  public static cleanImage(imagePath: string, outputPath?: string): boolean {
    if (!existsSync(imagePath)) return false;
    const scriptPath = join(WorkspacePaths.appRoot, 'scripts/common/clean-2d-plinth.py');
    if (!existsSync(scriptPath)) {
      console.warn(`[PlinthCleaner2D] Script not found at ${scriptPath}`);
      return false;
    }

    try {
      const args = [scriptPath, imagePath];
      if (outputPath) {
        args.push('--out', outputPath);
      }
      const outcome = spawnSync('python3', args, { encoding: 'utf8' });

      if (outcome.status === 0 && outcome.stdout.includes('PLINTH_CLEANED')) {
        return true;
      }
      if (outcome.stderr) {
        console.warn(`[PlinthCleaner2D] Warning: ${outcome.stderr}`);
      }
      return false;
    } catch (err) {
      console.warn(`[PlinthCleaner2D] Failed to clean plinth: ${(err as Error).message}`);
      return false;
    }
  }
}
