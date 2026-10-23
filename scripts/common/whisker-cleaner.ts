import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspacePaths } from './workspace-paths.js';

export class WhiskerCleaner {
  private static readonly felinePattern =
    /\b(cat|kitten|kitty|feline|tuxedo|calico|tabby|siamese|gato|gata|gatinho|gatinha|felino|felina|felinos|leopardo|leopard|panther|pantera|jaguar|cheetah|guepardo|lion|leao|leão|tiger|tigre)\b/i;

  public static isFeline(name: string, prompt?: string): boolean {
    const text = `${name} ${prompt ?? ''}`;
    return this.felinePattern.test(text);
  }

  public static cleanSheet(sheetPath: string, columns = 3, rows = 2): boolean {
    return this.runScript(sheetPath, columns, rows);
  }

  public static cleanImage(imagePath: string): boolean {
    return this.runScript(imagePath, 1, 1);
  }

  private static runScript(filePath: string, cols: number, rows: number): boolean {
    if (!existsSync(filePath)) return false;
    const scriptPath = join(WorkspacePaths.appRoot, 'scripts/common/clean-feline-whiskers.py');
    if (!existsSync(scriptPath)) {
      console.warn(`[WhiskerCleaner] Script not found at ${scriptPath}`);
      return false;
    }

    try {
      const outcome = spawnSync(
        'python3',
        [scriptPath, filePath, '--cols', String(cols), '--rows', String(rows)],
        { encoding: 'utf8' }
      );

      if (outcome.status === 0 && outcome.stdout.includes('WHISKER_CLEANED')) {
        return true;
      }
      if (outcome.stderr) {
        console.warn(`[WhiskerCleaner] Warning: ${outcome.stderr}`);
      }
      return false;
    } catch (err) {
      console.warn(`[WhiskerCleaner] Failed to clean whiskers: ${(err as Error).message}`);
      return false;
    }
  }
}
