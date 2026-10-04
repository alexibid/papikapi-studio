import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlenderRunner } from '../common/blender-runner.js';
import type { BakedPages, PageBaker, PageTextureSource } from './interfaces/layout.interface.js';
import { buildTextureLayout } from './texture-layout.js';

const MILLIMETRES_PER_INCH = 25.4;

export class PageTextures {
  constructor(private readonly source: PageTextureSource) {}

  public bake: PageBaker = (placements, frame) => {
    const { settings, directory } = this.source;
    const pixelsPerMm = settings.texture_dpi / MILLIMETRES_PER_INCH;
    const layoutPath = join(directory, 'layout.json');
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    writeFileSync(layoutPath, JSON.stringify(buildTextureLayout(placements, frame)));
    const result = BlenderRunner.run<BakedPages>(
      this.source.blender,
      this.source.blender.texture_script,
      {
        input_net: this.source.netPath,
        input_glb: this.source.modelPath,
        input_layout: layoutPath,
        output_dir: directory,
        pixels_per_mm: pixelsPerMm,
        bleed_px: Math.ceil(settings.texture_bleed_mm * pixelsPerMm),
        jpeg_quality: settings.texture_jpeg_quality,
        cage_extrusion_ratio: settings.cage_extrusion_ratio,
        max_ray_distance_ratio: settings.max_ray_distance_ratio,
        bake_samples: settings.bake_samples,
      },
    );
    return result.pages;
  };

  public discard(): void {
    rmSync(this.source.directory, { recursive: true, force: true });
  }
}
