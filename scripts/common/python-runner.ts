import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspacePaths } from './workspace-paths.js';

export interface PythonRunnerConfig {
  executable?: string;
  packages?: readonly string[];
}

export class PythonRunner {
  private static readonly resultMarker = 'PAPERCRAFT_RESULT ';
  private static readonly errorMarker = 'PAPERCRAFT_ERROR ';
  private static readonly maxOutputBytes = 64 * 1024 * 1024;

  private static resolveUvBinary(): string | undefined {
    const candidates = ['/opt/homebrew/bin/uv', '/usr/local/bin/uv', 'uv'];
    for (const candidate of candidates) {
      if (candidate === 'uv') return 'uv';
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  public static run<Result>(scriptName: string, settings: object, config?: PythonRunnerConfig): Result {
    const scriptPath = join(WorkspacePaths.appRoot, scriptName);
    if (!existsSync(scriptPath)) {
      throw new Error(`Python script not found at ${scriptPath}`);
    }

    const uvBinary = this.resolveUvBinary();
    const packages = config?.packages ?? ['numpy', 'pillow', 'scipy'];
    const args: string[] = [];

    let command = config?.executable;
    if (!command) {
      if (uvBinary) {
        command = uvBinary;
        args.push('run', '--python', '3.12', '--with', packages.join(','), 'python', scriptPath, '--', JSON.stringify(settings));
      } else {
        command = 'python3';
        args.push(scriptPath, '--', JSON.stringify(settings));
      }
    } else {
      args.push(scriptPath, '--', JSON.stringify(settings));
    }

    const outcome = spawnSync(command, args, {
      encoding: 'utf8',
      maxBuffer: this.maxOutputBytes,
    });

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
      const reason = failure ? (JSON.parse(failure) as string) : `Python exited with code ${exitCode}`;
      throw new Error(reason);
    }
    const result = this.payloadAfter(lines, this.resultMarker);
    if (result === undefined) {
      throw new Error('Python finished without reporting a result');
    }
    return JSON.parse(result) as Result;
  }
}
