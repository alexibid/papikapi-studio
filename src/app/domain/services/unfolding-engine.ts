import {
  FoldLine,
  GlueTab,
  ModelBox,
  ModelSpike,
  PaperModel,
  UnfoldedPart,
  UnfoldedSheet,
} from '../models/kirigami-model';

const SHEET_WIDTH = 210;
const SHEET_HEIGHT = 297;
const MARGIN = 12;
const TAB_DEPTH = 6;

export function unfoldModel(model: PaperModel): UnfoldedSheet {
  if (model.boxes.length === 0) {
    return {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      parts: [],
      validationErrors: ['Model contains no 3D boxes.'],
    };
  }

  let scale = calculatePackingScale(model.boxes, model.spikes);
  let bestSheet: { parts: UnfoldedPart[]; errors: string[] } = { parts: [], errors: [] };

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = packBoxesAtScale(model.boxes, model.spikes, scale);
    bestSheet = candidate;

    if (candidate.errors.length === 0) {
      break;
    }
    scale *= 0.91;
  }

  return {
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    parts: bestSheet.parts,
    validationErrors: bestSheet.errors,
  };
}

function packBoxesAtScale(
  boxes: readonly ModelBox[],
  spikes: readonly ModelSpike[] | undefined,
  scale: number
): { parts: UnfoldedPart[]; errors: string[] } {
  const parts: UnfoldedPart[] = [];
  const errors: string[] = [];

  let currentX = MARGIN;
  let currentY = MARGIN + 16;
  let rowHeight = 0;

  const allNets: UnfoldedPart[] = boxes.map((box, index) => unfoldBox(box, scale, index + 1));
  if (spikes && spikes.length > 0) {
    allNets.push(unfoldCrestSpikes(spikes, scale, boxes.length + 1));
  }

  for (const net of allNets) {
    if (currentX + net.width > SHEET_WIDTH - MARGIN) {
      currentX = MARGIN;
      currentY += rowHeight + 6;
      rowHeight = 0;
    }

    if (currentY + net.height > SHEET_HEIGHT - MARGIN) {
      errors.push(`Part '${net.id}' exceeds A4 sheet height boundaries.`);
    }

    const positionedPart: UnfoldedPart = {
      ...net,
      x: currentX,
      y: currentY,
      boundaryPath: translatePath(net.boundaryPath, currentX, currentY),
      folds: net.folds.map((fold) => ({
        ...fold,
        x1: fold.x1 + currentX,
        y1: fold.y1 + currentY,
        x2: fold.x2 + currentX,
        y2: fold.y2 + currentY,
      })),
      tabs: net.tabs.map((tab) => ({
        ...tab,
        points: tab.points.map(([px, py]) => [px + currentX, py + currentY] as const),
      })),
      frontFace: net.frontFace
        ? {
            x: net.frontFace.x + currentX,
            y: net.frontFace.y + currentY,
            width: net.frontFace.width,
            height: net.frontFace.height,
          }
        : undefined,
    };

    parts.push(positionedPart);
    currentX += net.width + 6;
    if (net.height > rowHeight) {
      rowHeight = net.height;
    }
  }

  return { parts, errors };
}

function calculatePackingScale(
  boxes: readonly ModelBox[],
  spikes: readonly ModelSpike[] | undefined
): number {
  if (boxes.length === 0) return 1;
  let totalAreaNeeded = boxes.reduce(
    (acc, box) => acc + (2 * box.width + 2 * box.depth) * (box.height + 2 * box.depth),
    0
  );
  if (spikes && spikes.length > 0) {
    totalAreaNeeded += spikes.length * 14 * 20;
  }
  const printableArea = (SHEET_WIDTH - 2 * MARGIN) * (SHEET_HEIGHT - 2 * MARGIN - 30);
  const rawScale = Math.sqrt(printableArea / (totalAreaNeeded * 1.6));
  return Math.min(Math.max(rawScale, 0.35), 0.75);
}

function unfoldBox(box: ModelBox, scale: number, partIndex: number): UnfoldedPart {
  const w = Math.round(box.width * scale * 10) / 10;
  const h = Math.round(box.height * scale * 10) / 10;
  const d = Math.round(box.depth * scale * 10) / 10;
  const tab = Math.max(Math.round(TAB_DEPTH * scale * 10) / 10, 3.5);

  const netWidth = d + w + d + w + tab;
  const netHeight = d + h + d;

  const folds: FoldLine[] = [
    { x1: d, y1: 0, x2: d + w, y2: 0, kind: 'mountain' },
    { x1: d, y1: d, x2: d + w, y2: d, kind: 'mountain' },
    { x1: d, y1: d + h, x2: d + w, y2: d + h, kind: 'mountain' },
    { x1: d, y1: d, x2: d, y2: d + h, kind: 'mountain' },
    { x1: d + w, y1: d, x2: d + w, y2: d + h, kind: 'mountain' },
    { x1: d + w + d, y1: d, x2: d + w + d, y2: d + h, kind: 'mountain' },
    { x1: d + w + d + w, y1: d, x2: d + w + d + w, y2: d + h, kind: 'mountain' },
  ];

  const tabs: GlueTab[] = [
    {
      id: `${box.id}-side-tab`,
      label: `${partIndex}A`,
      points: [
        [d + w + d + w, d],
        [d + w + d + w + tab, d + tab * 0.7],
        [d + w + d + w + tab, d + h - tab * 0.7],
        [d + w + d + w, d + h],
      ],
    },
    {
      id: `${box.id}-top-tab`,
      label: `${partIndex}B`,
      points: [
        [d, 0],
        [d + tab * 0.7, -tab],
        [d + w - tab * 0.7, -tab],
        [d + w, 0],
      ],
    },
  ];

  const boundaryPath = `M ${d} 0 L ${d + w} 0 L ${d + w} ${d} L ${d + w + d + w} ${d} L ${d + w + d + w + tab} ${d + tab * 0.7} L ${d + w + d + w + tab} ${d + h - tab * 0.7} L ${d + w + d + w} ${d + h} L ${d + w} ${d + h} L ${d + w} ${d + h + d} L ${d} ${d + h + d} L ${d} ${d + h} L 0 ${d + h} L 0 ${d} L ${d} ${d} Z`;

  return {
    id: box.id,
    label: box.id,
    hue: box.hue,
    decor: box.decor,
    boundaryPath,
    folds,
    tabs,
    width: netWidth,
    height: netHeight + tab,
    x: 0,
    y: 0,
    frontFace: {
      x: d,
      y: d,
      width: w,
      height: h,
    },
  };
}

function unfoldCrestSpikes(
  spikes: readonly ModelSpike[],
  scale: number,
  partIndex: number
): UnfoldedPart {
  const count = spikes.length;
  const spikeWidth = Math.max(Math.round(12 * scale * 10) / 10, 8);
  const spikeHeight = Math.max(Math.round(16 * scale * 10) / 10, 10);
  const baseHeight = Math.max(Math.round(7 * scale * 10) / 10, 5);
  const totalWidth = count * spikeWidth;
  const totalHeight = spikeHeight + baseHeight;
  const hue = spikes[0]?.hue || '#e63946';

  let path = `M 0 ${totalHeight} L 0 ${spikeHeight}`;
  for (let i = 0; i < count; i++) {
    const midX = i * spikeWidth + spikeWidth / 2;
    const endX = (i + 1) * spikeWidth;
    path += ` L ${Math.round(midX * 10) / 10} 0 L ${Math.round(endX * 10) / 10} ${spikeHeight}`;
  }
  path += ` L ${totalWidth} ${totalHeight} Z`;

  const folds: FoldLine[] = [
    { x1: 0, y1: spikeHeight, x2: totalWidth, y2: spikeHeight, kind: 'mountain' },
  ];

  const tabH = Math.max(Math.round(4 * scale * 10) / 10, 3);
  const tabs: GlueTab[] = [
    {
      id: 'crest-base-tab',
      label: `${partIndex}C`,
      points: [
        [0, totalHeight],
        [tabH, totalHeight + tabH],
        [totalWidth - tabH, totalHeight + tabH],
        [totalWidth, totalHeight],
      ],
    },
  ];

  return {
    id: 'crest-spikes',
    label: 'Crest Spikes',
    hue,
    decor: 'none',
    boundaryPath: path,
    folds,
    tabs,
    width: totalWidth,
    height: totalHeight + tabH,
    x: 0,
    y: 0,
  };
}

function translatePath(path: string, dx: number, dy: number): string {
  return path.replace(/([0-9.-]+)\s+([0-9.-]+)/g, (_, xStr, yStr) => {
    const x = Number.parseFloat(xStr) + dx;
    const y = Number.parseFloat(yStr) + dy;
    return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  });
}
