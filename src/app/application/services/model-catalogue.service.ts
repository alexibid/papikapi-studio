import { Injectable, computed, signal } from '@angular/core';
import { readCatalogue } from '../../domain/models/catalogue-entry';
import { MODEL_STAGES, ModelStage, PaperModel } from '../../domain/models/paper-model';

const CATALOGUE_URL = '/uploads/gallery.json';

@Injectable({ providedIn: 'root' })
export class ModelCatalogueService {
  private readonly models = signal<readonly PaperModel[]>([]);
  private readonly selectedId = signal<string>('');
  private readonly stage = signal<ModelStage>('ready');
  private readonly loading = signal<boolean>(false);
  private readonly problem = signal<string>('');

  readonly shelf = this.stage.asReadonly();
  readonly all = computed(() => this.models().filter((model) => model.state === this.stage()));
  readonly countOf = (stage: ModelStage): number =>
    this.models().filter((model) => model.state === stage).length;
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

  show(stage: ModelStage): void {
    this.stage.set(stage);
    this.selectedId.set(this.all()[0]?.id ?? '');
  }

  private adopt(models: readonly PaperModel[]): void {
    this.models.set(models);
    this.stage.set(this.firstStocked(models));
    this.selectedId.set(this.all()[0]?.id ?? '');
  }

  private firstStocked(models: readonly PaperModel[]): ModelStage {
    const stocked = (stage: ModelStage): boolean => models.some((model) => model.state === stage);
    const current = this.stage();
    return stocked(current) ? current : (MODEL_STAGES.find(stocked) ?? current);
  }
}
