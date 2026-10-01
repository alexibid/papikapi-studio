import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BlenderConfig } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

export class BlenderRunner {
  private static readonly resultMarker = 'PAPERCRAFT_RESULT ';
  private static readonly errorMarker = 'PAPERCRAFT_ERROR ';
  private static readonly maxOutputBytes = 64 * 1024 * 1024;

  public static run<Result>(blender: BlenderConfig, scriptName: string, settings: object): Result {
    if (!existsSync(blender.executable)) {
      throw new Error(`Blender not found at ${blender.executable}`);
    }
    const scriptPath = join(WorkspacePaths.appRoot, scriptName);
    const outcome = spawnSync(
      blender.executable,
      ['--background', '--python', scriptPath, '--', JSON.stringify(settings)],
      { encoding: 'utf8', maxBuffer: this.maxOutputBytes },
    );
    const lines = `${outcome.stdout}\n${outcome.stderr}`.split('\n');
    return this.extractResult<Result>(lines, outcome.status);
  }

  private static payloadAfter(lines: readonly string[], marker: string): string | undefined {
    const line = lines.find((candidate) => candidate.includes(marker));
    return line === undefined ? undefined : line.slice(line.indexOf(marker) + marker.length);
  }

  private static extractResult<Result>(lines: readonly string[], exitCode: number | null): Result {
    const failure = this.payloadAfter(lines, this.errorMarker);
    if (exitCode !== 0 || failure !== undefined) {
      const reason = failure ? JSON.parse(failure) as string : `Blender exited with code ${exitCode}`;
      throw new Error(reason);
    }
    const result = this.payloadAfter(lines, this.resultMarker);
    if (result === undefined) {
      throw new Error('Blender finished without reporting a result');
    }
    return JSON.parse(result) as Result;
  }
}
