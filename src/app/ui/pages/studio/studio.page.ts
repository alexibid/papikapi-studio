import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '@ibid/services';
import { PaperModel, UnfoldedSheet } from '../../../domain/models/kirigami-model';
import { unfoldModel } from '../../../domain/services/unfolding-engine';
import { validateKirigamiGeometry, ValidationReport } from '../../../domain/services/geometry-validator';
import { SAMPLE_DINO, SAMPLE_DRAGON, SAMPLE_PENGUIN, SAMPLE_FOX, SAMPLE_HOUSE } from '../../../domain/data/sample-models';
import { GeminiService } from '../../../application/services/gemini.service';
import { PdfExportService } from '../../../application/services/pdf-export.service';
import { ModelViewer3DComponent } from '../../components/model-viewer-3d/model-viewer-3d';
import { CutSheetPreviewComponent, SheetMode } from '../../components/cut-sheet-preview/cut-sheet-preview';

@Component({
  selector: 'kirigami-studio-page',
  standalone: true,
  imports: [
    FormsModule,
    ModelViewer3DComponent,
    CutSheetPreviewComponent,
  ],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
})
export class StudioPage {
  protected readonly i18n = inject(I18nService);
  protected readonly gemini = inject(GeminiService);
  protected readonly pdf = inject(PdfExportService);

  protected readonly sampleDino = SAMPLE_DINO;
  protected readonly sampleDragon = SAMPLE_DRAGON;
  protected readonly samplePenguin = SAMPLE_PENGUIN;
  protected readonly sampleFox = SAMPLE_FOX;
  protected readonly sampleHouse = SAMPLE_HOUSE;

  protected readonly currentModel = signal<PaperModel>(SAMPLE_DINO);
  protected readonly promptText = signal<string>('');
  protected readonly rawJson = signal<string>(JSON.stringify(SAMPLE_DINO, null, 2));
  protected readonly selectedTab = signal<'3d' | 'pdf'>('3d');
  protected readonly sheetMode = signal<SheetMode>('coloured');
  protected readonly copiedToast = signal<boolean>(false);
  protected readonly jsonError = signal<string | null>(null);
  protected readonly modelType = signal<'flash' | 'pro'>('flash');
  protected readonly showKeyInput = signal<boolean>(false);
  protected readonly apiKeyInput = signal<string>(this.gemini.apiKey());

  protected readonly unfoldedSheet = computed<UnfoldedSheet>(() =>
    unfoldModel(this.currentModel())
  );

  protected readonly validationReport = computed<ValidationReport>(() =>
    validateKirigamiGeometry(this.currentModel(), this.unfoldedSheet())
  );

  protected async generate(): Promise<void> {
    const prompt = this.promptText().trim();
    if (!prompt) return;

    try {
      const generated = await this.gemini.generateModel(prompt, this.modelType());
      this.currentModel.set(generated);
      this.rawJson.set(JSON.stringify(generated, null, 2));
      this.jsonError.set(null);
    } catch (err) {
      this.jsonError.set(err instanceof Error ? err.message : 'Generation failed');
    }
  }

  protected loadSample(model: PaperModel): void {
    this.currentModel.set(model);
    this.rawJson.set(JSON.stringify(model, null, 2));
    this.jsonError.set(null);
  }

  protected onCodeInput(code: string): void {
    this.rawJson.set(code);
    try {
      const parsed = JSON.parse(code) as PaperModel;
      if (parsed && Array.isArray(parsed.boxes)) {
        this.currentModel.set(parsed);
        this.jsonError.set(null);
      }
    } catch (_err) {
      this.jsonError.set('JSON syntax error');
    }
  }

  protected saveApiKey(): void {
    this.gemini.setApiKey(this.apiKeyInput().trim());
    this.showKeyInput.set(false);
  }

  protected copyTypeScript(): void {
    const code = this.pdf.generateTypeScriptCode(this.currentModel());
    this.copiedToast.set(true);
    setTimeout(() => this.copiedToast.set(false), 2400);

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
  }

  protected printPdf(): void {
    this.pdf.printSheet(
      this.unfoldedSheet(),
      this.currentModel().nameKey,
      this.sheetMode() === 'outline'
    );
  }

  protected downloadSvg(): void {
    this.pdf.downloadSvg(this.currentModel().nameKey);
  }
}
