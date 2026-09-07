import {
  CurveMap,
  PlacedDecor,
  PlacedOverlay,
  PlacedPlate,
  Point2,
  UnfoldedFigure,
} from '../models/paper-figure';

export type SheetMode = 'coloured' | 'outline';

const CUT_STROKE = '#1b1b1b';
const CUT_WIDTH = 0.7;
const FOLD_WIDTH = 0.4;
const FOLD_DASH = '3 2';

export function outlineToPath(outline: readonly Point2[], curves: CurveMap = {}): string {
  if (outline.length === 0) return '';

  const segments = outline.map((_, index) => {
    const next = outline[(index + 1) % outline.length];
    const control = curves[index];
    return control
      ? `Q ${fmt(control[0])} ${fmt(control[1])} ${fmt(next[0])} ${fmt(next[1])}`
      : `L ${fmt(next[0])} ${fmt(next[1])}`;
  });

  return `M ${fmt(outline[0][0])} ${fmt(outline[0][1])} ${segments.join(' ')} Z`;
}

export function renderFigureSvg(figure: UnfoldedFigure, mode: SheetMode = 'coloured'): string {
  const scope = Math.random().toString(36).slice(2, 8);
  const body = [
    renderClipPaths(figure, scope),
    ...figure.plates.map((plate) => renderPlateFill(plate, mode)),
    ...figure.plates.flatMap((plate) => renderOverlays(plate, mode, scope)),
    ...figure.plates.flatMap((plate) => renderDecor(plate, mode)),
    ...figure.plates.flatMap((plate) => renderCutEdges(plate)),
    ...figure.folds.map((fold) => renderFold(fold.from, fold.to)),
  ].join('\n  ');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${figure.sheetWidth}mm"` +
    ` height="${figure.sheetHeight}mm" viewBox="0 0 ${figure.sheetWidth} ${figure.sheetHeight}">` +
    `\n  <rect width="${figure.sheetWidth}" height="${figure.sheetHeight}" fill="#ffffff"/>` +
    `\n  ${body}\n</svg>`
  );
}

function renderPlateFill(plate: PlacedPlate, mode: SheetMode): string {
  const fill = mode === 'outline' ? '#ffffff' : plate.hue;
  return `<path d="${outlineToPath(plate.outline, plate.curves)}" fill="${fill}"/>`;
}

function renderClipPaths(figure: UnfoldedFigure, scope: string): string {
  const clips = figure.plates
    .map(
      (plate) =>
        `<clipPath id="${clipId(plate.id, scope)}">` +
        `<path d="${outlineToPath(plate.outline, plate.curves)}"/></clipPath>`
    )
    .join('');
  return `<defs>${clips}</defs>`;
}

function clipId(plateId: string, scope: string): string {
  return `clip-${scope}-${plateId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function renderOverlays(plate: PlacedPlate, mode: SheetMode, scope: string): readonly string[] {
  if (mode === 'outline' || plate.overlays.length === 0) return [];

  const shapes = plate.overlays
    .map(
      (overlay: PlacedOverlay) =>
        `<path d="${outlineToPath(overlay.outline, overlay.curves)}" fill="${overlay.hue}"/>`
    )
    .join('');
  return [`<g clip-path="url(#${clipId(plate.id, scope)})">${shapes}</g>`];
}

function renderDecor(plate: PlacedPlate, mode: SheetMode): readonly string[] {
  if (mode === 'outline') {
    return plate.decor
      .filter((decor) => decor.kind === 'eye')
      .map((decor) => ellipse(decor, 'none', CUT_STROKE));
  }
  return plate.decor.map((decor) => ellipse(decor, decor.hue, 'none'));
}

function ellipse(decor: PlacedDecor, fill: string, stroke: string): string {
  const rotation = (decor.angle * 180) / Math.PI;
  const transform = `rotate(${rotation.toFixed(2)} ${fmt(decor.cx)} ${fmt(decor.cy)})`;
  return (
    `<ellipse cx="${fmt(decor.cx)}" cy="${fmt(decor.cy)}" rx="${decor.rx}" ry="${decor.ry}"` +
    ` fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : FOLD_WIDTH}"` +
    ` transform="${transform}"/>`
  );
}

function renderCutEdges(plate: PlacedPlate): readonly string[] {
  return plate.cutEdges.map((edge) => {
    const shape = edge.control
      ? `M ${fmt(edge.from[0])} ${fmt(edge.from[1])} Q ${fmt(edge.control[0])} ${fmt(edge.control[1])}` +
        ` ${fmt(edge.to[0])} ${fmt(edge.to[1])}`
      : `M ${fmt(edge.from[0])} ${fmt(edge.from[1])} L ${fmt(edge.to[0])} ${fmt(edge.to[1])}`;
    return (
      `<path d="${shape}" fill="none" stroke="${CUT_STROKE}"` +
      ` stroke-width="${CUT_WIDTH}" stroke-linecap="round"/>`
    );
  });
}

function renderFold(from: Point2, to: Point2): string {
  return (
    `<line x1="${fmt(from[0])}" y1="${fmt(from[1])}" x2="${fmt(to[0])}" y2="${fmt(to[1])}"` +
    ` stroke="${CUT_STROKE}" stroke-width="${FOLD_WIDTH}" stroke-dasharray="${FOLD_DASH}"/>`
  );
}

function fmt(value: number): string {
  return value.toFixed(2);
}
