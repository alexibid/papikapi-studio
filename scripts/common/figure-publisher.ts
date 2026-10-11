import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CatalogueModelEntry } from './interfaces/index.js';
import { CatalogueManager } from './catalogue-manager.js';
import { WorkspacePaths } from './workspace-paths.js';

const SITE_FILES: readonly string[] = ['assembly.json', 'model.glb', 'art.jpeg'];
const PDF_FILE = 'sheets.pdf';
const REQUIRED_FILE = 'model.glb';
const INDEX_FILE = 'index.json';
const SITE_SUBPATH: readonly string[] = ['dist', 'assets-site', 'papikapi', 'figures'];
const DRIVE_FOLDER_PARTS: readonly string[] = ['My Drive', 'ibid-assets', 'papikapi'];
const DRIVE_OVERRIDE = 'IBID_FIGURES_DIR';
const DRIVE_ID_ATTRIBUTE = 'com.google.drivefs.item-id#S';
const FIREBASE_PROJECT = 'ibid-32cbe';
const MTIME_TOLERANCE_MS = 2000;
const SYNC_POLL_MS = 5000;
const SYNC_TIMEOUT_MS = 20 * 60 * 1000;

export interface PublishedEntry extends CatalogueModelEntry {
  readonly files: Readonly<Record<string, { readonly rev: string }>>;
  readonly pdf?: { readonly id: string };
}

export interface PublishReport {
  readonly siteDir: string;
  readonly staged: readonly string[];
  readonly pdfsCopied: readonly string[];
  readonly indexed: number;
  readonly awaitingSync: number;
}

export class FigurePublisher {
  public static publish(modelIds: readonly string[]): PublishReport {
    const siteDir = FigurePublisher.siteDir();
    const staged = modelIds.flatMap((id) => FigurePublisher.stageModel(id, siteDir));
    const driveDir = FigurePublisher.locateDriveDir();
    const pdfsCopied = driveDir ? modelIds.flatMap((id) => FigurePublisher.copyPdf(id, driveDir)) : [];
    return { siteDir, staged, pdfsCopied, ...FigurePublisher.writeIndex(siteDir, driveDir) };
  }

  public static publishAll(): PublishReport {
    return FigurePublisher.publish(FigurePublisher.localModelIds());
  }

  public static refreshIndex(): PublishReport {
    const siteDir = FigurePublisher.siteDir();
    const driveDir = FigurePublisher.locateDriveDir();
    return { siteDir, staged: [], pdfsCopied: [], ...FigurePublisher.writeIndex(siteDir, driveDir) };
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

  public static deploy(): void {
    const args = ['firebase', 'deploy', '--only', 'hosting:assets', '--project', FIREBASE_PROJECT];
    execFileSync('npx', args, { cwd: WorkspacePaths.workspaceRoot, stdio: 'inherit' });
  }

  public static publishQuietly(modelId: string): void {
    try {
      const report = FigurePublisher.publish([modelId]);
      console.log(`[publish] ${modelId}: ${report.staged.length} file(s) staged in ${report.siteDir}`);
      void FigurePublisher.deployWhenSynced(modelId, report.awaitingSync > 0);
    } catch (error) {
      console.warn(`[publish] ${modelId} not published: ${(error as Error).message}`);
    }
  }

  private static async deployWhenSynced(modelId: string, mustWait: boolean): Promise<void> {
    try {
      FigurePublisher.deploy();
      if (!mustWait) return;
      const settled = await FigurePublisher.waitForSync();
      if (settled.awaitingSync === 0) FigurePublisher.deploy();
    } catch (error) {
      console.warn(`[publish] ${modelId} not deployed: ${(error as Error).message}`);
    }
  }

  private static siteDir(): string {
    const dir = join(WorkspacePaths.workspaceRoot, ...SITE_SUBPATH);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  public static locateDriveDir(): string | null {
    const override = process.env[DRIVE_OVERRIDE];
    if (override) return override;
    const cloud = join(homedir(), 'Library', 'CloudStorage');
    if (!existsSync(cloud)) return null;
    const accounts = readdirSync(cloud).filter((name) => name.startsWith('GoogleDrive-'));
    const found = accounts
      .map((name) => join(cloud, name, ...DRIVE_FOLDER_PARTS))
      .find((candidate) => existsSync(candidate));
    return found ? join(found, 'figures') : null;
  }

  private static localModelIds(): readonly string[] {
    return readdirSync(WorkspacePaths.publicModelsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  }

  private static stageModel(modelId: string, siteDir: string): readonly string[] {
    const source = WorkspacePaths.modelPath(modelId);
    if (!existsSync(join(source, REQUIRED_FILE))) return [];
    mkdirSync(join(siteDir, modelId), { recursive: true });
    return SITE_FILES.filter((file) => existsSync(join(source, file)))
      .filter((file) => FigurePublisher.copyIfChanged(join(source, file), join(siteDir, modelId, file)))
      .map((file) => `${modelId}/${file}`);
  }

  private static copyPdf(modelId: string, driveDir: string): readonly string[] {
    const from = join(WorkspacePaths.modelPath(modelId), PDF_FILE);
    if (!existsSync(from)) return [];
    mkdirSync(join(driveDir, modelId), { recursive: true });
    const to = join(driveDir, modelId, PDF_FILE);
    return FigurePublisher.copyIfChanged(from, to) ? [`${modelId}/${PDF_FILE}`] : [];
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

  private static writeIndex(
    siteDir: string,
    driveDir: string | null,
  ): { indexed: number; awaitingSync: number } {
    const staged = FigurePublisher.stagedIds(siteDir);
    const entries = CatalogueManager.sync()
      .filter((entry) => staged.has(entry.id))
      .map((entry) => FigurePublisher.entryOf(entry, driveDir));
    writeFileSync(join(siteDir, INDEX_FILE), `${JSON.stringify(entries, null, 1)}\n`, 'utf8');
    return { indexed: entries.length, awaitingSync: FigurePublisher.countAwaiting(entries) };
  }

  private static stagedIds(siteDir: string): ReadonlySet<string> {
    return new Set(
      readdirSync(siteDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(siteDir, entry.name, REQUIRED_FILE)))
        .map((entry) => entry.name),
    );
  }

  private static entryOf(entry: CatalogueModelEntry, driveDir: string | null): PublishedEntry {
    const source = WorkspacePaths.modelPath(entry.id);
    const files = Object.fromEntries(
      SITE_FILES.filter((file) => existsSync(join(source, file))).map((file) => {
        const stats = statSync(join(source, file));
        return [file, { rev: `${stats.size}-${Math.floor(stats.mtimeMs)}` }] as const;
      }),
    );
    const pdfId = driveDir ? FigurePublisher.driveId(join(driveDir, entry.id, PDF_FILE)) : null;
    return pdfId ? { ...entry, files, pdf: { id: pdfId } } : { ...entry, files };
  }

  private static countAwaiting(entries: readonly PublishedEntry[]): number {
    return entries.filter(
      (entry) => existsSync(join(WorkspacePaths.modelPath(entry.id), PDF_FILE)) && !entry.pdf,
    ).length;
  }

  private static driveId(path: string): string | null {
    if (!existsSync(path)) return null;
    try {
      return execFileSync('xattr', ['-p', DRIVE_ID_ATTRIBUTE, path], { encoding: 'utf8' }).trim() || null;
    } catch {
      return null;
    }
  }
}
