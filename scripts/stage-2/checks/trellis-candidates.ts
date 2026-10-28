import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunPodClient } from '../../common/runpod-client.js';

interface CandidateRecipe {
  readonly label: string;
  readonly input: string;
  readonly seed: number;
  readonly targetFaces: number;
  readonly textureSize: number;
  readonly simplify: number;
}

interface TrellisOutput {
  readonly glb_base64: string;
  readonly face_count: number;
}

export class TrellisCandidates {
  private static readonly usdPerSecond = 0.00031;

  public static async run(directory: string, recipes: readonly CandidateRecipe[]): Promise<void> {
    mkdirSync(directory, { recursive: true });
    const endpointId = RunPodClient.getEndpointId('RUNPOD_TRELLIS_ENDPOINT_ID');
    for (const recipe of recipes) {
      await this.generate(endpointId, directory, recipe);
    }
  }

  private static async generate(
    endpointId: string,
    directory: string,
    recipe: CandidateRecipe,
  ): Promise<void> {
    const image = readFileSync(join(directory, recipe.input)).toString('base64');
    const result = await RunPodClient.execute<Record<string, unknown>, TrellisOutput>(
      endpointId,
      {
        image_base64: image,
        seed: recipe.seed,
        simplify: recipe.simplify,
        target_faces: recipe.targetFaces,
        texture_size: recipe.textureSize,
      },
      { timeoutMs: 600000, maxRetries: 0 },
    );
    writeFileSync(join(directory, `${recipe.label}.glb`), Buffer.from(result.output.glb_base64, 'base64'));
    const costUsd = Math.round(result.seconds * this.usdPerSecond * 10000) / 10000;
    writeFileSync(
      join(directory, `${recipe.label}.json`),
      JSON.stringify({ ...recipe, faces: result.output.face_count, seconds: result.seconds, costUsd }, null, 2),
    );
    console.log(`${recipe.label}: ${result.output.face_count} faces, ${result.seconds}s, $${costUsd}`);
  }
}

const recipes = JSON.parse(readFileSync(process.argv[3], 'utf8')) as readonly CandidateRecipe[];

await TrellisCandidates.run(process.argv[2], recipes);
