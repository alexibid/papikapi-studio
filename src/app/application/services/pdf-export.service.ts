import { Injectable, inject } from '@angular/core';
import { I18nService } from '@ibid/services';
import { PaperFigure } from '../../domain/models/paper-figure';

const SHEET_SELECTOR = '.c-figure-sheet';

@Injectable({
  providedIn: 'root',
})
export class PdfExportService {
  private readonly i18n = inject(I18nService);

  generateTypeScriptCode(figure: PaperFigure): string {
    const constName = figure.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    return `export const ${constName}: PaperFigure = ${JSON.stringify(figure, null, 2)};`;
  }

  printSheet(figureName: string): void {
    const svgHtml = this.readSheetMarkup();
    if (!svgHtml) {
      throw new Error(this.i18n.translate('errorNoSheetToPrint'));
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error(this.i18n.translate('errorPrintWindowBlocked'));
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${figureName} - Kirigami Print</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
            svg { width: 100vw; height: 100vh; }
          </style>
        </head>
        <body>
          ${svgHtml}
          <script>
            window.onload = () => { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  downloadSvg(figureName: string): void {
    const svgHtml = this.readSheetMarkup();
    if (!svgHtml) {
      throw new Error(this.i18n.translate('errorNoSheetToExport'));
    }

    const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${figureName.toLowerCase().replace(/\s+/g, '-')}-kirigami.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private readSheetMarkup(): string {
    return document.querySelector(SHEET_SELECTOR)?.outerHTML ?? '';
  }
}
