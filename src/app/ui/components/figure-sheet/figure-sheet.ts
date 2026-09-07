import { Component, computed, input } from '@angular/core';
import {
  PaperFigure,
  PlacedCutEdge,
  PlacedDecor,
  PlacedOverlay,
  PlacedPlate,
} from '../../../domain/models/paper-figure';
import { outlineToPath } from '../../../domain/services/figure-svg';
import { unfoldFigure } from '../../../domain/services/figure-unfolder';

let instanceCount = 0;

@Component({
  selector: 'kirigami-figure-sheet',
  standalone: true,
  templateUrl: './figure-sheet.html',
  styleUrl: './figure-sheet.scss',
})
export class FigureSheetComponent {
  readonly figure = input.required<PaperFigure>();

  private readonly scope = `fs${instanceCount++}`;

  protected readonly sheet = computed(() => unfoldFigure(this.figure()));
  protected readonly viewBox = computed(
    () => `0 0 ${this.sheet().sheetWidth} ${this.sheet().sheetHeight}`
  );

  protected platePath(plate: PlacedPlate): string {
    return outlineToPath(plate.outline, plate.curves);
  }

  protected overlayPath(overlay: PlacedOverlay): string {
    return outlineToPath(overlay.outline, overlay.curves);
  }

  protected cutPath(edge: PlacedCutEdge): string {
    const head = `M ${edge.from[0]} ${edge.from[1]}`;
    return edge.control
      ? `${head} Q ${edge.control[0]} ${edge.control[1]} ${edge.to[0]} ${edge.to[1]}`
      : `${head} L ${edge.to[0]} ${edge.to[1]}`;
  }

  protected clipId(plate: PlacedPlate): string {
    return `${this.scope}-${plate.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }

  protected clipRef(plate: PlacedPlate): string {
    return `url(#${this.clipId(plate)})`;
  }

  protected rotationOf(decor: PlacedDecor): string {
    const degrees = (decor.angle * 180) / Math.PI;
    return `rotate(${degrees} ${decor.cx} ${decor.cy})`;
  }
}
