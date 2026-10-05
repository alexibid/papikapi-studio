import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { RunPodClient } from '../common/runpod-client.js';
import type { FluxSheetOutput, RedrawCost, RedrawParameters } from './interfaces/art-texture.interface.js';

export class ViewRedrawer {
  private static readonly white = { r: 255, g: 255, b: 255 };

  private static async referenceOf(viewPath: string, size: number): Promise<string> {
    const flattened = await sharp(viewPath).flatten({ background: this.white }).resize(size, size).png().toBuffer();
    return flattened.toString('base64');
  }

  private static async redrawView(viewsDir: string, view: string, parameters: RedrawParameters): Promise<{ sheet: Buffer; seconds: number }> {
    const payload = {
      prompt: parameters.prompt,
      cell_prompts: Array<string>(parameters.columns * parameters.rows).fill(parameters.prompt),
      reference_images: [await this.referenceOf(join(viewsDir, `${view}.png`), parameters.reference_size_px)],
      columns: parameters.columns,
      rows: parameters.rows,
    };
    const endpoint = RunPodClient.getEndpointId(parameters.endpoint_env_key);
    const result = await RunPodClient.execute<typeof payload, FluxSheetOutput>(endpoint, payload);
    return { sheet: Buffer.from(result.output.sheet_base64, 'base64'), seconds: result.seconds };
  }

  public static readCost(costFile: string): RedrawCost {
    return existsSync(costFile) ? (JSON.parse(readFileSync(costFile, 'utf8')) as RedrawCost) : { seconds: 0, costUsd: 0 };
  }

  private static recordCost(costFile: string, seconds: number): RedrawCost {
    const rate = PipelineConfigLoader.load().pricing.runpod_flux_usd_per_sec ?? 0;
    const previous = this.readCost(costFile);
    const total = {
      seconds: Math.round((previous.seconds + seconds) * 1000) / 1000,
      costUsd: Math.round((previous.costUsd + seconds * rate) * 10000) / 10000,
    };
    writeFileSync(costFile, `${JSON.stringify(total, null, 2)}\n`);
    return total;
  }

  public static async redrawAll(viewsDir: string, sheetsDir: string, costFile: string, parameters: RedrawParameters): Promise<RedrawCost> {
    mkdirSync(sheetsDir, { recursive: true });
    for (const view of parameters.views) {
      const target = join(sheetsDir, `${view}.jpg`);
      if (existsSync(target)) continue;
      const { sheet, seconds } = await this.redrawView(viewsDir, view, parameters);
      writeFileSync(target, sheet);
      this.recordCost(costFile, seconds);
    }
    return this.readCost(costFile);
  }
}
