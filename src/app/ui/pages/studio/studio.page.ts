import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { I18nService } from '@ibid/services';
import { BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, ScrimComponent } from 'ibid-ui';
import { ModelCatalogueService } from '../../../application/services/model-catalogue.service';
import {
  Active3DGeneration,
  ModelCreatorService,
} from '../../../application/services/model-creator.service';
import { PaperModel } from '../../../domain/models/paper-model';
import { ModelCreatorComponent } from '../../components/model-creator/model-creator';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';
import { ProcessLoaderComponent } from '../../components/process-loader/process-loader';

@Component({
  selector: 'kirigami-studio-page',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    ModelCreatorComponent,
    ModelViewer3DComponent,
    ProcessLoaderComponent,
    ScrimComponent,
  ],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly catalogue = inject(ModelCatalogueService);
  protected readonly creator = inject(ModelCreatorService);

  protected readonly selected = this.catalogue.selected;
  protected readonly pendingModelId = signal<string>(this.loadInitialSelected());
  protected readonly previewVersion = signal<number>(Date.now());

  protected readonly selectedModelId = computed(() => {
    return this.selected()?.id || this.pendingModelId();
  });

  protected readonly loaderPreview = signal<Active3DGeneration | null>(null);

  protected readonly activeCanvasLoader = computed(() => {
    const id = this.selectedModelId();
    return this.loaderPreview() ?? (id ? this.creator.getGeneration(id) : null);
  });

  protected readonly pendingGenerations = computed(() => {
    const existingIds = new Set(this.catalogue.all().map((m) => m.id));
    return Object.values(this.creator.activeGenerations()).filter(
      (gen) => !existingIds.has(gen.modelName)
    );
  });

  protected readonly preview = computed(() => {
    const model = this.selected();
    if (!model || this.creator.isGenerating3d(model.id)) return '';
    return `${model.modelPath}?v=${this.previewVersion()}`;
  });
  protected readonly showCreator = signal<boolean>(false);

  private loadInitialSelected(): string {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem('kirigami_selected_model') || '';
    } catch {
      return '';
    }
  }

  private saveSelected(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('kirigami_selected_model', id);
    } catch {}
  }

  ngOnInit(): void {
    void this.catalogue.load().then(() => {
      const saved = this.loadInitialSelected();
      if (saved) {
        this.pendingModelId.set(saved);
        this.catalogue.select(saved);
      }
    });
  }

  protected choose(model: PaperModel): void {
    this.pendingModelId.set(model.id);
    this.catalogue.select(model.id);
    this.saveSelected(model.id);
  }

  protected chooseById(id: string): void {
    this.pendingModelId.set(id);
    this.catalogue.select(id);
    this.saveSelected(id);
  }

  protected isChosen(model: PaperModel): boolean {
    return this.selectedModelId() === model.id;
  }

  protected async refresh(): Promise<void> {
    await fetch('/api/catalogue/sync', { method: 'POST' }).catch(() => {});
    await this.catalogue.load();
    this.previewVersion.set(Date.now());
  }

  protected toggleLoaderPreview(): void {
    const isShowing = this.loaderPreview() !== null;
    this.loaderPreview.set(
      isShowing ? null : { modelName: this.selectedModelId(), pick: 3, startedAt: Date.now() },
    );
  }

  protected openCreator(): void {
    this.creator.reset();
    this.showCreator.set(true);
  }

  protected closeCreator(): void {
    this.showCreator.set(false);
  }

  protected async changePick(modelId: string): Promise<void> {
    const hasAlternatives = await this.creator.loadExistingAlternatives(modelId);
    if (hasAlternatives) {
      this.showCreator.set(true);
    } else {
      alert(this.i18n.translate('noAlternativesFound'));
    }
  }

  protected async deleteModel(modelId: string): Promise<void> {
    const confirmed = window.confirm(this.i18n.translate('deleteModelConfirm'));
    if (!confirmed) return;

    const ok = await this.creator.deleteModel(modelId);
    if (ok) {
      await this.catalogue.load();
      const all = this.catalogue.all();
      if (all.length > 0) {
        this.catalogue.select(all[0].id);
      }
      this.previewVersion.set(Date.now());
    }
  }

  protected async onPickSelected(event: { name: string; pick: number }): Promise<void> {
    const { name, pick } = event;
    this.showCreator.set(false);
    this.pendingModelId.set(name);
    this.catalogue.select(name);
    this.saveSelected(name);

    const isCached = this.creator.cachedPicks().includes(pick);
    if (isCached) {
      const result = await this.creator.pickAlternative(name, pick, true);
      if (result && result.success) {
        await this.catalogue.load();
        this.catalogue.select(result.name);
        this.previewVersion.set(Date.now());
      }
    } else {
      void this.creator.pickAlternative(name, pick, false).then(async (result) => {
        if (result && result.success) {
          await this.catalogue.load();
          this.catalogue.select(result.name);
          this.previewVersion.set(Date.now());
        }
      });
    }
  }

  protected async onModelCreated(modelId: string): Promise<void> {
    this.showCreator.set(false);
    this.pendingModelId.set(modelId);
    await this.catalogue.load();
    this.catalogue.select(modelId);
    this.previewVersion.set(Date.now());
  }
}
