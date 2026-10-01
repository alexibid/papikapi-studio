import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { CaptionManifest } from '../../common/interfaces/index.js';
import { WorkspacePaths } from '../../common/workspace-paths.js';

export class LoraDatasetBuilder {
  private static readonly trainingDir = join(WorkspacePaths.appRoot, 'scripts/training');
  private static readonly referencesDir = join(LoraDatasetBuilder.trainingDir, 'references');
  private static readonly manifestFile = join(LoraDatasetBuilder.trainingDir, 'lora/captions.json');
  private static readonly outputDir = join(WorkspacePaths.appRoot, 'resources/lora/papikapi-dataset');
  private static readonly archiveFile = join(WorkspacePaths.appRoot, 'resources/lora/papikapi-dataset.zip');

  public static run(): void {
    const manifest = this.readManifest();
    this.assertReferencesExist(manifest);
    this.resetOutput();

    for (const [reference, caption] of Object.entries(manifest.captions)) {
      this.writeSample(reference, `${manifest.trigger}, ${caption}`);
    }

    this.archive();
    console.log(`Dataset: ${Object.keys(manifest.captions).length} samples -> ${this.archiveFile}`);
  }

  private static readManifest(): CaptionManifest {
    return JSON.parse(readFileSync(this.manifestFile, 'utf-8')) as CaptionManifest;
  }

  private static assertReferencesExist(manifest: CaptionManifest): void {
    const missing = Object.keys(manifest.captions).filter((reference) => !existsSync(join(this.referencesDir, reference)));
    if (missing.length > 0) {
      throw new Error(`Missing reference images: ${missing.join(', ')}`);
    }
  }

  private static resetOutput(): void {
    rmSync(this.outputDir, { recursive: true, force: true });
    rmSync(this.archiveFile, { force: true });
    mkdirSync(this.outputDir, { recursive: true });
  }

  private static writeSample(reference: string, caption: string): void {
    const sampleName = `${basename(dirname(reference))}-${basename(reference, '.jpeg')}`;
    copyFileSync(join(this.referencesDir, reference), join(this.outputDir, `${sampleName}.jpeg`));
    writeFileSync(join(this.outputDir, `${sampleName}.txt`), caption);
  }

  private static archive(): void {
    execFileSync('zip', ['-q', '-j', '-r', this.archiveFile, this.outputDir]);
  }
}

LoraDatasetBuilder.run();
