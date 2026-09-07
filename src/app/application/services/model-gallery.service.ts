import { Injectable, signal } from '@angular/core';
import { AgeTierId } from '../../domain/models/age-tier';
import { PaperFigure } from '../../domain/models/paper-figure';

export interface GalleryItem {
  readonly id: string;
  readonly createdAt: number;
  readonly prompt: string;
  readonly tierId: AgeTierId;
  readonly figure: PaperFigure;
}

const STORAGE_KEY = 'kirigami_studio_gallery';

@Injectable({
  providedIn: 'root',
})
export class ModelGalleryService {
  readonly items = signal<readonly GalleryItem[]>(this.readStorage());

  save(figure: PaperFigure, prompt: string, tierId: AgeTierId): GalleryItem {
    const item: GalleryItem = {
      id: figure.id || `item-${Date.now()}`,
      createdAt: Date.now(),
      prompt,
      tierId,
      figure,
    };

    this.items.update((prev) => {
      const filtered = prev.filter((existing) => existing.id !== item.id);
      const updated = [item, ...filtered].slice(0, 40);
      this.writeStorage(updated);
      return updated;
    });

    return item;
  }

  remove(id: string): void {
    this.items.update((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      this.writeStorage(updated);
      return updated;
    });
  }

  clear(): void {
    this.items.set([]);
    this.writeStorage([]);
  }

  private readStorage(): readonly GalleryItem[] {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as readonly GalleryItem[]) : [];
    } catch {
      return [];
    }
  }

  private writeStorage(items: readonly GalleryItem[]): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      return;
    }
  }
}
