import { Injectable, computed, signal } from '@angular/core';
import { readCatalogue } from '../../domain/models/catalogue-entry';
import { PaperModel } from '../../domain/models/paper-model';

const CATALOGUE_URL = '/models/index.json';

@Injectable({ providedIn: 'root' })
export class ModelCatalogueService {
  private readonly models = signal<readonly PaperModel[]>([]);
  private readonly selectedId = signal<string>('');
  private readonly loading = signal<boolean>(false);
  private readonly problem = signal<string>('');

  readonly all = this.models.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly failure = this.problem.asReadonly();
  readonly selected = computed(() =>
    this.all().find((model) => model.id === this.selectedId())
  );

  async load(): Promise<void> {
    this.loading.set(true);
    this.problem.set('');
    try {
      const response = await fetch(CATALOGUE_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      this.adopt(readCatalogue(await response.json()));
    } catch {
      this.adopt([]);
      this.problem.set('catalogueUnavailable');
    } finally {
      this.loading.set(false);
    }
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  private adopt(models: readonly PaperModel[]): void {
    this.models.set(models);
    const current = this.selectedId();
    if (!current || !models.some((m) => m.id === current)) {
      this.selectedId.set(models[0]?.id ?? '');
    }
  }
}
