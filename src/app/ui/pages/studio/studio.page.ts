import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { I18nService } from '@ibid/services';
import { BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, ScrimComponent } from 'ibid-ui';
import { ModelCatalogueService } from '../../../application/services/model-catalogue.service';
import { ModelCreatorService } from '../../../application/services/model-creator.service';
import { PaperModel } from '../../../domain/models/paper-model';
import { ModelCreatorComponent } from '../../components/model-creator/model-creator';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';

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
  protected readonly preview = computed(() => this.selected()?.modelPath ?? '');
  protected readonly showCreator = signal<boolean>(false);

  ngOnInit(): void {
    void this.catalogue.load();
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
    }
  }

  protected async onModelCreated(modelId: string): Promise<void> {
    this.showCreator.set(false);
    await this.catalogue.load();
    this.catalogue.select(modelId);
  }
}
