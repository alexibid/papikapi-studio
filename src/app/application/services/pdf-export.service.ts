import { Injectable } from '@angular/core';
import { PaperModel, UnfoldedSheet } from '../../domain/models/kirigami-model';

@Injectable({
  providedIn: 'root',
})
export class PdfExportService {
  generateTypeScriptCode(model: PaperModel): string {
    const formattedBoxes = JSON.stringify(model.boxes, null, 2);
    const formattedPrisms = JSON.stringify(model.prisms ?? [], null, 2);
    const formattedSpikes = JSON.stringify(model.spikes ?? [], null, 2);
    const constName = `BOX_${model.nameKey.toUpperCase().replace(/^MODEL/, '')}`;

    return `export const ${constName}: PaperModel = {
  id: '${model.id}',
  nameKey: '${model.nameKey}',
  span: ${model.span},
  boxes: ${formattedBoxes},
  prisms: ${formattedPrisms},
  spikes: ${formattedSpikes},
};`;
  }

  printSheet(_sheet: UnfoldedSheet, modelName: string, _isOutline: boolean): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const svgElement = document.querySelector('.c-sheet-preview__svg');
    const svgHtml = svgElement ? svgElement.outerHTML : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${modelName} - Kirigami Print</title>
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

  downloadSvg(modelName: string): void {
    const svgElement = document.querySelector('.c-sheet-preview__svg');
    if (!svgElement) return;

    const svgBlob = new Blob([svgElement.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modelName.toLowerCase().replace(/\s+/g, '-')}-kirigami.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
