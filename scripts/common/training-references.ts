import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InlineImage, ReferenceItem } from './interfaces/index.js';
import { GeminiClient } from './gemini-client.js';
import { WorkspacePaths } from './workspace-paths.js';

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

    const groupKeywords: Record<string, string[]> = {
      cats: ['cat', 'kitten', 'feline', 'kitty', 'gato', 'gata', 'gatinho', 'gatinha', 'felino', 'siamese', 'calico', 'tuxedo', 'tabby'],
      dogs: ['dog', 'puppy', 'hound', 'canine', 'cao', 'cão', 'cachorro', 'cadela', 'cachorrinho', 'pug', 'shepherd', 'dalmatian', 'rottweiler'],
      dinosaurs: ['dino', 'dinosaur', 'dinossauro', 'rex', 't-rex', 'sauropod', 'triceratops', 'stegosaurus', 'brachiosaurus', 'velociraptor', 'ankylosaurus', 'estegossauro', 'braquiossauro', 'anquilossauro'],
      safari: ['safari', 'savana', 'lion', 'cheetah', 'elephant', 'giraffe', 'zebra', 'hippo', 'leao', 'leão', 'elefante', 'girafa', 'hipopotamo', 'hipopótamo', 'chita'],
      forest: ['forest', 'woodland', 'floresta', 'bear', 'fox', 'squirrel', 'deer', 'fawn', 'hedgehog', 'raccoon', 'owl', 'urso', 'raposa', 'esquilo', 'veado', 'ourico', 'ouriço', 'guaxinim', 'coruja'],
      vehicles: ['vehicle', 'veiculo', 'veículo', 'car', 'carro', 'truck', 'camiao', 'camião', 'plane', 'aviao', 'avião', 'train', 'comboio', 'trem', 'submarine', 'submarino', 'tractor', 'trator'],
      ocean: ['ocean', 'sea', 'marine', 'shark', 'hammerhead', 'clownfish', 'fish', 'octopus', 'dolphin', 'turtle', 'seahorse', 'tubarao', 'peixe', 'polvo', 'golfinho', 'tartaruga', 'marinho', 'oceano'],
      minecraft: ['minecraft', 'steve', 'creeper', 'zombie', 'pig', 'alex', 'cow'],
      games: ['game', 'gaming', 'sonic', 'mario', 'kirby', 'yoshi', 'donkey-kong', 'pikachu', 'pokemon', 'jogos'],
    };

    const words = query.toLowerCase().split(/[^a-z0-9]+/g).filter((w) => w.length > 2);

    for (const [group, keywords] of Object.entries(groupKeywords)) {
      if (keywords.some((kw) => words.includes(kw) || normalized.includes(kw))) {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length > 0) {
          let bestInGroup = groupItems[0];
          let bestScore = 0;
          for (const item of groupItems) {
            const itemTokens = item.name.toLowerCase().split('-');
            let s = 0;
            for (const token of itemTokens) {
              if (token.length >= 3 && words.includes(token)) s += 2;
            }
            if (s > bestScore) {
              bestScore = s;
              bestInGroup = item;
            }
          }
          const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', bestInGroup.file);
          if (existsSync(fullPath)) return { item: bestInGroup, path: fullPath };
        }
      }
    }

    const nameMatch = items.find((i) => {
      const itemName = i.name.toLowerCase();
      if (itemName.length < 3) return false;
      return normalized.includes(itemName) || itemName.includes(normalized);
    });
    if (nameMatch) {
      const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', nameMatch.file);
      if (existsSync(fullPath)) return { item: nameMatch, path: fullPath };
    }

    let bestScoredItem: ReferenceItem | null = null;
    let highestScore = 0;

    for (const item of items) {
      const itemTokens = item.name.toLowerCase().split('-');
      let score = 0;
      for (const token of itemTokens) {
        if (token.length < 3) continue;
        if (words.includes(token)) {
          score += 2;
        } else if (token.length >= 4 && words.some((w) => w.length >= 4 && (w.includes(token) || token.includes(w)))) {
          score += 1;
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestScoredItem = item;
      }
    }

    if (bestScoredItem && highestScore > 0) {
      const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', bestScoredItem.file);
      if (existsSync(fullPath)) return { item: bestScoredItem, path: fullPath };
    }

    return null;
  }

  public static getItemsByGroup(group: string): readonly ReferenceItem[] {
    const items = this.loadIndex();
    return items.filter((i) => i.group.toLowerCase() === group.toLowerCase());
  }

  public static findRelated(query: string, count = 6): readonly { item: ReferenceItem; path: string }[] {
    const items = this.loadIndex();
    if (items.length === 0) return [];

    const results: { item: ReferenceItem; path: string }[] = [];
    const seenNames = new Set<string>();

    const primary = this.find(query);
    if (primary) {
      results.push(primary);
      seenNames.add(primary.item.name);

      const groupItems = this.getItemsByGroup(primary.item.group);
      for (const gi of groupItems) {
        if (results.length >= count) break;
        if (!seenNames.has(gi.name)) {
          const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', gi.file);
          if (existsSync(fullPath)) {
            results.push({ item: gi, path: fullPath });
            seenNames.add(gi.name);
          }
        }
      }
    }

    for (const it of items) {
      if (results.length >= count) break;
      if (!seenNames.has(it.name)) {
        const fullPath = join(WorkspacePaths.appRoot, 'scripts/training/references', it.file);
        if (existsSync(fullPath)) {
          results.push({ item: it, path: fullPath });
          seenNames.add(it.name);
        }
      }
    }

    return results;
  }

  public static findStyleImage(name: string, prompt: string): { image: InlineImage; item: ReferenceItem; path: string } | null {
    return this.getInlineImage(prompt) ?? this.getInlineImage(name);
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
