import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CatalogueModelEntry } from './interfaces/index.js';
import { CatalogueManager } from './catalogue-manager.js';
import { WorkspacePaths } from './workspace-paths.js';

const PUBLISHED_FILES: readonly string[] = ['assembly.json', 'model.glb', 'sheets.pdf', 'art.jpeg'];
const REQUIRED_FILE = 'model.glb';
const INDEX_FILE = 'index.json';
const TARGET_OVERRIDE = 'IBID_FIGURES_DIR';
const DRIVE_FOLDER_PARTS: readonly string[] = ['My Drive', 'ibid-assets', 'papikapi'];
const MTIME_TOLERANCE_MS = 2000;

const DRIVE_ID_ATTRIBUTE = 'com.google.drivefs.item-id#S';
const SYNC_POLL_MS = 5000;
const SYNC_TIMEOUT_MS = 20 * 60 * 1000;

export interface PublishedFile {
  readonly id: string;
  readonly rev: string;
}

export interface PublishedEntry extends CatalogueModelEntry {
  readonly files: Readonly<Record<string, PublishedFile>>;
}

export interface PublishReport {
  readonly targetDir: string;
  readonly copied: readonly string[];
  readonly indexed: number;
  readonly awaitingSync: number;
}

export class FigurePublisher {
  public static publish(modelIds: readonly string[]): PublishReport {
    const targetDir = FigurePublisher.requireTargetDir();
    const copied = modelIds.flatMap((id) => FigurePublisher.copyModel(id, targetDir));
    const { indexed, awaitingSync } = FigurePublisher.writeIndex(targetDir);
    return { targetDir, copied, indexed, awaitingSync };
  }

  public static refreshIndex(): PublishReport {
    const targetDir = FigurePublisher.requireTargetDir();
    return { targetDir, copied: [], ...FigurePublisher.writeIndex(targetDir) };
  }

  public static async waitForSync(): Promise<PublishReport> {
    const deadline = Date.now() + SYNC_TIMEOUT_MS;
    let report = FigurePublisher.refreshIndex();
    while (report.awaitingSync > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_MS));
      report = FigurePublisher.refreshIndex();
    }
    return report;
  }

  public static publishAll(): PublishReport {
    return FigurePublisher.publish(FigurePublisher.localModelIds());
  }

  public static publishQuietly(modelId: string): void {
    try {
      const report = FigurePublisher.publish([modelId]);
      console.log(`[publish] ${modelId}: ${report.copied.length} file(s) -> ${report.targetDir}`);
      void FigurePublisher.indexWhenSynced(modelId);
    } catch (error) {
      console.warn(`[publish] ${modelId} not published: ${(error as Error).message}`);
    }
  }

  private static async indexWhenSynced(modelId: string): Promise<void> {
    try {
      const report = await FigurePublisher.waitForSync();
      const state = report.awaitingSync === 0 ? 'indexed' : 'still syncing';
      console.log(`[publish] ${modelId}: Drive ${state} (${report.indexed} figure(s))`);
    } catch (error) {
      console.warn(`[publish] ${modelId} index not refreshed: ${(error as Error).message}`);
    }
  }

  public static locateTargetDir(): string | null {
    const override = process.env[TARGET_OVERRIDE];
    if (override) return override;
    const cloud = join(homedir(), 'Library', 'CloudStorage');
    if (!existsSync(cloud)) return null;
    const accounts = readdirSync(cloud).filter((name) => name.startsWith('GoogleDrive-'));
    const base = accounts.map((name) => join(cloud, name, ...DRIVE_FOLDER_PARTS));
    const found = base.find((candidate) => existsSync(candidate));
    return found ? join(found, 'figures') : null;
  }

  private static requireTargetDir(): string {
    const target = FigurePublisher.locateTargetDir();
    if (!target) {
      throw new Error(
        `Google Drive folder ibid-assets/papikapi not found. Sync it or set ${TARGET_OVERRIDE}.`,
      );
    }
    mkdirSync(target, { recursive: true });
    return target;
  }

  private static localModelIds(): readonly string[] {
    return readdirSync(WorkspacePaths.publicModelsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  }

  private static copyModel(modelId: string, targetDir: string): readonly string[] {
    const source = WorkspacePaths.modelPath(modelId);
    if (!existsSync(join(source, REQUIRED_FILE))) return [];
    const destination = join(targetDir, modelId);
    mkdirSync(destination, { recursive: true });
    return PUBLISHED_FILES.filter((file) => existsSync(join(source, file)))
      .filter((file) => FigurePublisher.copyIfChanged(join(source, file), join(destination, file)))
      .map((file) => `${modelId}/${file}`);
  }

  private static copyIfChanged(from: string, to: string): boolean {
    if (existsSync(to) && !FigurePublisher.isStale(from, to)) return false;
    copyFileSync(from, to);
    return true;
  }

  private static isStale(from: string, to: string): boolean {
    const source = statSync(from);
    const published = statSync(to);
    return source.size !== published.size || source.mtimeMs > published.mtimeMs + MTIME_TOLERANCE_MS;
  }

  private static writeIndex(targetDir: string): { indexed: number; awaitingSync: number } {
    const published = FigurePublisher.publishedIds(targetDir);
    const entries = CatalogueManager.sync()
      .filter((entry) => published.has(entry.id))
      .map((entry) => FigurePublisher.entryWithDriveIds(entry, targetDir));
    writeFileSync(join(targetDir, INDEX_FILE), `${JSON.stringify(entries, null, 1)}\n`, 'utf8');
    return { indexed: entries.length, awaitingSync: FigurePublisher.countUnsynced(entries, targetDir) };
  }

  private static publishedIds(targetDir: string): ReadonlySet<string> {
    return new Set(
      readdirSync(targetDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(targetDir, entry.name, REQUIRED_FILE)))
        .map((entry) => entry.name),
    );
  }

  private static entryWithDriveIds(entry: CatalogueModelEntry, targetDir: string): PublishedEntry {
    const files = Object.fromEntries(
      PUBLISHED_FILES.flatMap((file) => {
        const published = FigurePublisher.publishedFile(join(targetDir, entry.id, file));
        return published ? [[file, published] as const] : [];
      }),
    );
    return { ...entry, files };
  }

  private static publishedFile(path: string): PublishedFile | null {
    if (!existsSync(path)) return null;
    const id = FigurePublisher.driveId(path);
    if (!id) return null;
    const stats = statSync(path);
    return { id, rev: `${stats.size}-${Math.floor(stats.mtimeMs)}` };
  }

  private static driveId(path: string): string | null {
    try {
      return execFileSync('xattr', ['-p', DRIVE_ID_ATTRIBUTE, path], { encoding: 'utf8' }).trim() || null;
    } catch {
      return null;
    }
  }

  private static countUnsynced(entries: readonly PublishedEntry[], targetDir: string): number {
    return entries.reduce((total, entry) => {
      const present = PUBLISHED_FILES.filter((file) => existsSync(join(targetDir, entry.id, file)));
      return total + present.filter((file) => !entry.files[file]).length;
    }, 0);
  }
}
