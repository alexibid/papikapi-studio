import type { TrayItem, TrayParameters, Vec2 } from './interfaces/assembly.interface.js';

export class TrayLayout {
  public static place(
    items: readonly TrayItem[],
    frontEdgeMm: number,
    parameters: TrayParameters,
  ): readonly Vec2[] {
    const { tray_gap_mm: gap, tray_row_width_mm: rowWidth } = parameters;
    const placements: Vec2[] = [];
    let cursorX = -rowWidth / 2;
    let rowTop = frontEdgeMm - gap;
    let rowDepth = 0;

    for (const item of items) {
      if (cursorX + item.size[0] > rowWidth / 2 && rowDepth > 0) {
        cursorX = -rowWidth / 2;
        rowTop -= rowDepth + gap;
        rowDepth = 0;
      }
      placements.push([cursorX - item.origin[0], rowTop - item.size[1] - item.origin[1]]);
      cursorX += item.size[0] + gap;
      rowDepth = Math.max(rowDepth, item.size[1]);
    }
    return placements;
  }
}
