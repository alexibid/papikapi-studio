import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import { ManifestManager } from '../common/manifest-manager.js';
import { PythonRunner } from '../common/python-runner.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  ArtTextureParameters,
  ArtTextureScripts,
  ArtTextureStatistics,
  AtlasModelStatistics,
  SelectedViewsStatistics,
} from './interfaces/art-texture.interface.js';
import type { TexturizeBlenderConfig } from './interfaces/texturize.interface.js';
import { ViewRedrawer } from './view-redraw.js';

export interface ArtTextureInputs {
  readonly modelName: string;
  readonly stageId: string;
  readonly stageDir: string;
  readonly meshPath: string;
  readonly viewsDir: string;
  readonly modelPath: string;
  readonly modelPublicName: string;
  readonly blender: TexturizeBlenderConfig;
  readonly scripts: ArtTextureScripts;
  readonly parameters: ArtTextureParameters;
}

export class ArtTexturizer {
  private static readonly pythonPackages = ['numpy', 'pillow', 'scipy', 'opencv-python-headless'];

  public static async execute(inputs: ArtTextureInputs): Promise<{ modelPath: string; seconds: number }> {
    const start = Date.now();
    const workDir = join(inputs.stageDir, 'step-2-redraw');
    const artPath = join(WorkspacePaths.resourcePath(inputs.modelName), 'stage-2', 'step-1-art-cutout.png');
    if (!existsSync(artPath)) throw new Error(`Art cutout not found: ${artPath}`);

    const cost = await ViewRedrawer.redrawAll(inputs.viewsDir, join(workDir, 'sheets'), join(workDir, 'cost.json'), inputs.parameters.redraw);
    const selection = PythonRunner.run<SelectedViewsStatistics>(inputs.scripts.redraw_script, {
      views_dir: inputs.viewsDir,
      sheets_dir: join(workDir, 'sheets'),
      output_dir: join(workDir, 'views'),
      columns: inputs.parameters.redraw.columns,
      rows: inputs.parameters.redraw.rows,
    }, { packages: this.pythonPackages });

    const textureDir = join(inputs.stageDir, 'art-texture');
    const alignedMeshPath = join(inputs.stageDir, 'step-2-aligned.json');
    const texture = PythonRunner.run<ArtTextureStatistics>(inputs.scripts.texture_script, {
      input_mesh: inputs.meshPath,
      input_art: artPath,
      views_dir: inputs.viewsDir,
      redrawn_views_dir: join(workDir, 'views'),
      head_cells: inputs.parameters.head_cells,
      pixel_min_aligned_ratio: inputs.parameters.pixel_min_aligned_ratio,
      organic_group_angle_deg: inputs.parameters.organic_group_angle_deg,
      organic_group_deviation_ratio: inputs.parameters.organic_group_deviation_ratio,
      organic_group_extent_ratio: inputs.parameters.organic_group_extent_ratio,
      output_dir: textureDir,
      output_mesh: alignedMeshPath,
    }, { packages: this.pythonPackages });

    const model = BlenderRunner.run<AtlasModelStatistics>(inputs.blender, inputs.scripts.apply_script, {
      input_mesh: alignedMeshPath,
      uv_json: join(textureDir, 'faces_uv.json'),
      output_glb: inputs.modelPath,
    });

    const seconds = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    const publicDir = WorkspacePaths.modelPath(inputs.modelName);
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(inputs.modelPath, join(publicDir, inputs.modelPublicName));
    ManifestManager.writeStepResult(inputs.modelName, inputs.stageId, {
      status: 'DONE',
      seconds,
      costUsd: cost.costUsd,
      costNote: `RunPod FLUX.2 view redraw (${cost.seconds} s billed seconds)`,
      metrics: { faces: model.faces, ...texture, views: selection.views },
      data: { parameters: inputs.parameters },
    });
    return { modelPath: inputs.modelPath, seconds };
  }
}
