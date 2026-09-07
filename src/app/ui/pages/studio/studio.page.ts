import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '@ibid/services';
import { ButtonComponent, CardComponent } from 'ibid-ui';
import { TYRANNOSAURUS } from '../../../domain/data/figures/tyrannosaurus';
import { PaperFigure } from '../../../domain/models/paper-figure';
import { unfoldFigure } from '../../../domain/services/figure-unfolder';
import { PdfExportService } from '../../../application/services/pdf-export.service';
import { FigureSheetComponent } from '../../components/figure-sheet/figure-sheet';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';

type StudioTab = '3d' | 'sheet';

@Component({
  selector: 'kirigami-studio-page',
  standalone: true,
  imports: [
    ButtonComponent,
    CardComponent,
    ModelViewer3DComponent,
    FigureSheetComponent,
    RouterLink,
  ],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage {
  protected readonly i18n = inject(I18nService);
  private readonly pdf = inject(PdfExportService);

  protected readonly currentFigure = signal<PaperFigure>(TYRANNOSAURUS);
  protected readonly selectedTab = signal<StudioTab>('3d');
  protected readonly copiedToast = signal<boolean>(false);
  protected readonly exportError = signal<string | null>(null);

  protected readonly sheet = computed(() => unfoldFigure(this.currentFigure()));
  protected readonly plateCount = computed(() => this.currentFigure().plates.length);
  protected readonly hingeCount = computed(() => this.currentFigure().hinges.length);
  protected readonly sheetSize = computed(() => {
    const { sheetWidth, sheetHeight } = this.sheet();
    return `${Math.round(sheetWidth)} × ${Math.round(sheetHeight)} mm`;
  });

  protected copyTypeScript(): void {
    const code = this.pdf.generateTypeScriptCode(this.currentFigure());
    this.copiedToast.set(true);
    setTimeout(() => this.copiedToast.set(false), 2400);

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => undefined);
    }
  }

  protected printPdf(): void {
    this.runExport(() => this.pdf.printSheet(this.currentFigure().name));
  }

  protected downloadSvg(): void {
    this.runExport(() => this.pdf.downloadSvg(this.currentFigure().name));
  }

  private runExport(action: () => void): void {
    try {
      action();
      this.exportError.set(null);
    } catch (err) {
      this.exportError.set(err instanceof Error ? err.message : 'Export failed');
    }
  }
}
