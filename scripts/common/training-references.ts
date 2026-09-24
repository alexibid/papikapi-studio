import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InlineImage, GeminiClient } from './gemini-client.js';
import { WorkspacePaths } from './workspace-paths.js';

export interface ReferenceItem {
  readonly group: string;
  readonly name: string;
  readonly file: string;
  readonly caption: string;
}

export class TrainingReferences {
  private static cachedItems: readonly ReferenceItem[] | null = null;

  public static loadIndex(): readonly ReferenceItem[] {
    if (this.cachedItems) return this.cachedItems;

    const indexPath = join(WorkspacePaths.appRoot, 'scripts/training/references/index.json');
    if (!existsSync(indexPath)) {
      this.cachedItems = [];
      return this.cachedItems;
    }

    try {
      const raw = readFileSync(indexPath, 'utf-8');
      this.cachedItems = JSON.parse(raw) as ReferenceItem[];
    } catch {
      this.cachedItems = [];
    }

    return this.cachedItems;
  }

  public static find(query: string): { item: ReferenceItem; path: string } | null {
    const items = this.loadIndex();
    if (items.length === 0) return null;

    const normalized = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const exactMatch = items.find((i) => i.name.toLowerCase() === normalized);
    if (exactMatch) {
      const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', exactMatch.file);
      if (existsSync(fullPath)) return { item: exactMatch, path: fullPath };
    }

    const nameMatch = items.find((i) => {
      const itemName = i.name.toLowerCase();
      return normalized.includes(itemName) || itemName.includes(normalized);
    });
    if (nameMatch) {
      const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', nameMatch.file);
      if (existsSync(fullPath)) return { item: nameMatch, path: fullPath };
    }

    const groupKeywords: Record<string, string[]> = {
      cats: ['cat', 'kitten', 'feline', 'kitty'],
      dogs: ['dog', 'puppy', 'hound', 'canine'],
      dinosaurs: ['dino', 'dinosaur', 'rex', 't-rex', 'sauropod'],
      safari: ['safari', 'lion', 'cheetah', 'elephant', 'giraffe', 'zebra', 'hippo'],
      forest: ['forest', 'woodland', 'bear', 'fox', 'squirrel', 'deer', 'fawn', 'hedgehog', 'raccoon'],
      vehicles: ['vehicle', 'car', 'truck', 'plane', 'train', 'submarine', 'tractor'],
    };

    for (const [group, keywords] of Object.entries(groupKeywords)) {
      if (keywords.some((kw) => normalized.includes(kw))) {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length > 0) {
          const picked = groupItems[0];
          const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', picked.file);
          if (existsSync(fullPath)) return { item: picked, path: fullPath };
        }
      }
    }

    return null;
  }

  public static getInlineImage(query: string): { image: InlineImage; item: ReferenceItem; path: string } | null {
    const match = this.find(query);
    if (!match) return null;

    try {
      const bytes = readFileSync(match.path);
      const mime = GeminiClient.sniffMime(bytes);
      return {
        image: { bytes, mime },
        item: match.item,
        path: match.path,
      };
    } catch {
      return null;
    }
  }
}
