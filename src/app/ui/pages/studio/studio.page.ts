import { Component, OnInit, computed, inject } from '@angular/core';
import { I18nService } from '@ibid/services';
import { BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent } from 'ibid-ui';
import { ModelCatalogueService } from '../../../application/services/model-catalogue.service';
import {
  MODEL_STAGES,
  ModelStage,
  PaperModel,
  printedColours,
  totalFaces,
  totalPages,
} from '../../../domain/models/paper-model';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';

@Component({
  selector: 'kirigami-studio-page',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    ModelViewer3DComponent,
  ],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly catalogue = inject(ModelCatalogueService);

  protected readonly selected = this.catalogue.selected;
  protected readonly preview = computed(() => this.selected()?.previewPath ?? '');
  protected readonly pageTally = computed(() => this.tally(totalPages));
  protected readonly faceTally = computed(() => this.tally(totalFaces));
  protected readonly cardCount = computed(() => this.colours().length);
  protected readonly colours = computed(() => {
    const model = this.selected();
    return model ? printedColours(model) : [];
  });

  ngOnInit(): void {
    void this.catalogue.load();
  }

  protected readonly shelves = MODEL_STAGES;

  protected show(stage: ModelStage): void {
    this.catalogue.show(stage);
  }

  protected isShelf(stage: ModelStage): boolean {
    return this.catalogue.shelf() === stage;
  }

  protected countOf(stage: ModelStage): number {
    return this.catalogue.countOf(stage);
  }

  protected choose(model: PaperModel): void {
    this.catalogue.select(model.id);
  }

  protected isChosen(model: PaperModel): boolean {
    return this.selected()?.id === model.id;
  }

  protected refresh(): void {
    void this.catalogue.load();
  }

  private tally(measure: (model: PaperModel) => number): number {
    const model = this.selected();
    return model ? measure(model) : 0;
  }
}
