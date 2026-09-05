import { Component, computed, input } from '@angular/core';
import { UnfoldedSheet } from '../../../domain/models/kirigami-model';

export type SheetMode = 'coloured' | 'outline';

@Component({
  selector: 'kirigami-cut-sheet-preview',
  standalone: true,
  templateUrl: './cut-sheet-preview.html',
  styleUrl: './cut-sheet-preview.scss',
})
export class CutSheetPreviewComponent {
  readonly sheet = input.required<UnfoldedSheet>();
  readonly mode = input<SheetMode>('coloured');
  readonly modelName = input<string>('Model');

  protected readonly isOutline = computed(() => this.mode() === 'outline');

  protected pointsToString(points: readonly (readonly [number, number])[]): string {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
  }

  protected generateTeethPath(x: number, y: number, width: number, height: number): string {
    const count = 6;
    const step = width / count;
    const points: string[] = [`M ${x} ${y}`];
    for (let i = 0; i < count; i++) {
      points.push(`L ${x + step * (i + 0.5)} ${y + height * 0.8}`, `L ${x + step * (i + 1)} ${y}`);
    }
    return points.join(' ');
  }
}
