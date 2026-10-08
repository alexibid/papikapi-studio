import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlenderRunner } from '../../common/blender-runner.js';
import { CliArgsParser } from '../../common/cli-args-parser.js';
import { PythonRunner } from '../../common/python-runner.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';
import type { OptimizeConfig, OptimizeResponse, OptimizeStatistics } from './interfaces/optimize.interface.js';

export class TextureOptimizer {
  private static readonly here = dirname(fileURLToPath(import.meta.url));
  private static readonly experiment = 'scripts/stage-2/experiments';
  private static readonly stageDir = 'stage-2';

  private static loadConfig(): OptimizeConfig {
    return JSON.parse(readFileSync(join(this.here, 'optimize.config.json'), 'utf8')) as OptimizeConfig;
  }

  private static discoverModels(): readonly string[] {
    return readdirSync(WorkspacePaths.resourcesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(WorkspacePaths.stageResourceDir(name, this.stageDir), 'step-3-base.glb')))
      .sort();
  }

  private static renderViews(config: OptimizeConfig, glb: string, outputDir: string): void {
    BlenderRunner.run({ executable: config.blender }, `${this.experiment}/blender/render_views.py`, {
      glb,
      output_dir: outputDir,
      resolution: config.panel.view_resolution,
    });
  }

  public static execute(modelName: string, config: OptimizeConfig): OptimizeResponse {
    const stageDir = WorkspacePaths.stageResourceDir(modelName, this.stageDir);
    const baseGlb = join(stageDir, 'step-3-base.glb');
    const outputGlb = join(stageDir, 'step-4-optimize.glb');
    const viewsDir = join(stageDir, 'step-4-views');
    const panelPath = join(stageDir, 'step-4-panel.png');
    const start = Date.now();

    const statistics = PythonRunner.run<OptimizeStatistics>(
      `${this.experiment}/python/optimize_textures.py`,
      {
        ...config,
        base_glb: baseGlb,
        output_glb: outputGlb,
        textures_dir: join(stageDir, 'step-4-textures'),
        art_cutout: join(stageDir, 'step-1-art-cutout.png'),
      },
      { packages: config.packages },
    );

    rmSync(viewsDir, { recursive: true, force: true });
    this.renderViews(config, baseGlb, join(viewsDir, 'before'));
    this.renderViews(config, outputGlb, join(viewsDir, 'after'));
    PythonRunner.run(
      `${this.experiment}/python/compose_panel.py`,
      {
        before_dir: join(viewsDir, 'before'),
        after_dir: join(viewsDir, 'after'),
        art: join(WorkspacePaths.stageResourceDir(modelName, 'stage-1'), 'step-1-art.jpeg'),
        panel_path: panelPath,
        cell: config.panel.cell,
      },
      { packages: ['pillow'] },
    );

    const seconds = Math.round(((Date.now() - start) / 1000) * 10) / 10;
    writeFileSync(join(stageDir, 'step-4-report.json'), JSON.stringify({ model: modelName, seconds, ...statistics }, null, 2));
    return { name: modelName, modelPath: outputGlb, seconds, statistics };
  }

  public static run(): void {
    const requested = CliArgsParser.parse().model;
    const models = requested ? [requested.trim()] : this.discoverModels();
    const config = this.loadConfig();
    let failed = 0;
    for (const model of models) {
      try {
        const result = this.execute(model, config);
        const note = result.statistics.warnings.length > 0 ? ` | ${result.statistics.warnings.length} warning(s)` : '';
        console.log(`  \x1b[32m✔\x1b[0m ${model.padEnd(16)} ${result.seconds}s | texture ${result.statistics.texture.join('x')} | hue shift ${result.statistics.hueShiftDegrees}°${note}`);
        for (const warning of result.statistics.warnings) console.log(`      \x1b[33m!\x1b[0m ${warning}`);
      } catch (error) {
        failed += 1;
        console.error(`  \x1b[31m✖\x1b[0m ${model.padEnd(16)} ${(error as Error).message}`);
      }
    }
    if (failed > 0) process.exit(1);
  }
}

if (process.argv[1]?.endsWith('step-4-optimize-textures.ts')) {
  TextureOptimizer.run();
}
