import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { I18nService } from '@ibid/services';
import {
  BadgeComponent,
  ButtonComponent,
  CardComponent,
  EmptyStateComponent,
  ScrimComponent,
  SegmentOption,
  SegmentedControlComponent,
} from 'ibid-ui';
import { ModelCatalogueService } from '../../../application/services/model-catalogue.service';
import { ModelCostService } from '../../../application/services/model-cost.service';
import {
  Active3DGeneration,
  ModelCreatorService,
} from '../../../application/services/model-creator.service';
import { formatUsd } from '../../../domain/models/model-cost';
import { ModelPreviewView, PaperModel } from '../../../domain/models/paper-model';
import { AssemblyViewerComponent } from '../../components/assembly-viewer/assembly-viewer';
import { ModelCreatorComponent } from '../../components/model-creator/model-creator';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';
import { ProcessLoaderComponent } from '../../components/process-loader/process-loader';

const COST_STAGE_LABELS: Readonly<Record<string, string>> = {
  's1-step-1': 'costStageAlternatives',
  's2-step-1': 'costStageMesh',
  's3-step-2': 'costStageRedraw',
};

const PREVIEW_LABELS: Readonly<Record<ModelPreviewView, string>> = {
  'three-quarter': 'previewThreeQuarter',
  'three-quarter-wireframe': 'previewThreeQuarterWireframe',
};

@Component({
  selector: 'papikapi-studio-page',
  standalone: true,
  imports: [
    AssemblyViewerComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    ModelCreatorComponent,
    ModelViewer3DComponent,
    ProcessLoaderComponent,
    ScrimComponent,
    SegmentedControlComponent,
  ],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly catalogue = inject(ModelCatalogueService);
  protected readonly creator = inject(ModelCreatorService);
  protected readonly modelCost = inject(ModelCostService);
  protected readonly formatUsd = formatUsd;

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
      (gen) => !existingIds.has(gen.figureId)
    );
  });

  protected readonly preview = computed(() => {
    const model = this.selected();
    if (!model || this.creator.isGenerating3d(model.id)) return '';
    return `${model.modelPath}?v=${this.previewVersion()}`;
  });
  protected readonly viewMode = signal<string>('model');
  protected readonly viewOptions = computed<readonly SegmentOption[]>(() => [
    { value: 'model', label: this.i18n.translate('viewModel') },
    { value: 'assembly', label: this.i18n.translate('viewAssembly') },
  ]);
  protected readonly assemblySource = computed(() => {
    const model = this.selected();
    if (!model) return '';
    return `/models/${model.id}/assembly.json?v=${this.previewVersion()}`;
  });
  protected readonly pdfUrl = computed(() => {
    const model = this.selected();
    if (!model) return '';
    return `/models/${model.id}/sheets.pdf?v=${this.previewVersion()}`;
  });
  protected readonly showCreator = signal<boolean>(false);

  protected openPdf(): void {
    const url = this.pdfUrl();
    if (url) window.open(url, '_blank');
  }

  constructor() {
    effect(() => {
      const id = this.selected()?.id;
      this.previewVersion();
      if (id) void this.modelCost.load(id);
    });
  }

  protected previewLabel(view: ModelPreviewView): string {
    return this.i18n.translate(PREVIEW_LABELS[view]);
  }

  protected stageLabel(stageId: string): string {
    const key = COST_STAGE_LABELS[stageId];
    return key ? this.i18n.translate(key) : stageId;
  }

  private loadInitialSelected(): string {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem('papikapi_selected_model') || '';
    } catch {
      return '';
    }
  }

  private saveSelected(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('papikapi_selected_model', id);
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
      isShowing ? null : { figureId: this.selectedModelId(), pick: 3, startedAt: Date.now() },
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

  protected async onPickSelected(event: { figureId: string; pick: number }): Promise<void> {
    const { figureId, pick } = event;
    this.showCreator.set(false);
    this.pendingModelId.set(figureId);
    this.catalogue.select(figureId);
    this.saveSelected(figureId);

    const isCached = this.creator.cachedPicks().includes(pick);
    if (isCached) {
      const result = await this.creator.pickAlternative(figureId, pick, true);
      if (result && result.success) {
        await this.catalogue.load();
        this.catalogue.select(result.id);
        this.previewVersion.set(Date.now());
      }
    } else {
      void this.creator.pickAlternative(figureId, pick, false).then(async (result) => {
        if (result && result.success) {
          await this.catalogue.load();
          this.catalogue.select(result.id);
          this.previewVersion.set(Date.now());
        }
      });
    }
  }

  protected displayNameOf(figureId: string): string {
    const model = this.catalogue.all().find((candidate) => candidate.id === figureId);
    const language = this.i18n.currentLang() === 'en' ? 'en' : 'pt';
    return model ? model.displayName[language] : figureId;
  }

  protected async onModelCreated(modelId: string): Promise<void> {
    this.showCreator.set(false);
    this.pendingModelId.set(modelId);
    await this.catalogue.load();
    this.catalogue.select(modelId);
    this.previewVersion.set(Date.now());
  }
}
