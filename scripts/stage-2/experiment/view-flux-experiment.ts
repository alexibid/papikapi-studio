/**
 * Experiment (spends RunPod): FLUX.2-klein-4B removes the shadows of the six views of the model. The reference view (the one
 * the light hits) is cleaned alone; each other view is edited with the cleaned reference as first image so the colours match.
 *
 * Usage: npx tsx scripts/stage-2/experiment/view-flux-experiment.ts <model>   (after view-correction-experiment.py prepare)
 * Reads and writes resources/<model>/stage-2/experiment/ only, every file ends in -experiment.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { RunPodClient } from '../../common/runpod-client.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';

interface FluxSheet {
  readonly sheet_base64: string;
}

interface Plan {
  readonly reference: string;
  readonly views: readonly string[];
}

class ViewFluxExperiment {
  private static readonly endpointKey = 'RUNPOD_FLUX_ENDPOINT_ID';
  private static readonly background = { r: 229, g: 229, b: 229 };
  private static readonly size = 512;
  private static readonly referencePrompt =
    'Remove every shadow and all shading from this figure. Flat, even, neutral lighting with no darker sides and no cast ' +
    'shadow. Keep exactly the same shape, pose, colours, patterns and details. Plain light grey background.';
  private static readonly otherViewPrompt =
    'The first image shows a figure under flat, even lighting. The second image shows the same figure seen from another side, ' +
    'with shadows and shading. Edit the second image: remove all shadows and shading and give every part exactly the colour ' +
    'of the same part in the first image, under the same flat, even lighting. Keep the shape, pose and viewpoint of the ' +
    'second image. Plain light grey background.';

  private constructor(private readonly folder: string) {}

  private static async flattened(path: string): Promise<Buffer> {
    return sharp(path).flatten({ background: this.background }).resize(this.size, this.size).jpeg({ quality: 95 }).toBuffer();
  }

  private async edit(prompt: string, images: readonly Buffer[]): Promise<Buffer> {
    const endpointId = RunPodClient.getEndpointId(ViewFluxExperiment.endpointKey);
    const result = await RunPodClient.execute<Record<string, unknown>, FluxSheet>(endpointId, {
      prompt,
      columns: 1,
      rows: 1,
      cell_prompts: [prompt],
      reference_images: images.map((image) => image.toString('base64')),
    });
    console.log(`  FLUX answered in ${result.seconds}s`);
    return sharp(Buffer.from(result.output.sheet_base64, 'base64')).png().toBuffer();
  }

  private viewPath(name: string): string {
    return join(this.folder, `view-${name}-experiment.png`);
  }

  private fluxPath(name: string): string {
    return join(this.folder, `flux-${name}-experiment.png`);
  }

  private async run(plan: Plan): Promise<void> {
    const cleanedReference = await this.edit(ViewFluxExperiment.referencePrompt, [await ViewFluxExperiment.flattened(this.viewPath(plan.reference))]);
    writeFileSync(this.fluxPath(plan.reference), cleanedReference);
    const reference = await sharp(cleanedReference).jpeg({ quality: 95 }).toBuffer();
    for (const name of plan.views.filter((view) => view !== plan.reference)) {
      const edited = await this.edit(ViewFluxExperiment.otherViewPrompt, [reference, await ViewFluxExperiment.flattened(this.viewPath(name))]);
      writeFileSync(this.fluxPath(name), edited);
      console.log(`  ✔ ${name}`);
    }
  }

  public static async execute(model: string): Promise<void> {
    const folder = join(WorkspacePaths.stageResourceDir(model, 'stage-2'), 'experiment');
    const planPath = join(folder, 'view-plan-experiment.json');
    if (!existsSync(planPath)) throw new Error(`Run "view-correction-experiment.py prepare ${model}" first (${planPath} is missing)`);
    await new ViewFluxExperiment(folder).run(JSON.parse(readFileSync(planPath, 'utf8')) as Plan);
  }
}

const model = process.argv[2];
if (model === undefined) throw new Error('Usage: view-flux-experiment.ts <model>');
ViewFluxExperiment.execute(model).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
