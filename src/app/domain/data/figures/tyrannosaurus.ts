import { PaperFigure } from '../../models/paper-figure';
import {
  parseWireFigure,
  WireCurve,
  WireDecor,
  WireFigure,
  WirePlate,
  WirePoint,
} from '../../services/figure-wire';

const BODY_HUE = '#EE3E42';
const BELLY_HUE = '#F69D8C';
const STRIPE_HUE = '#C4122F';
const GUM_HUE = '#FCDE07';
const CLAW_HUE = '#040303';
const MOUTH_HUE = '#040303';
const TEETH_HUE = '#FEFEFE';

function points(pairs: readonly (readonly [number, number])[]): readonly WirePoint[] {
  return pairs.map(([x, y]) => ({ x, y }));
}

function curves(entries: readonly (readonly [number, number, number])[]): readonly WireCurve[] {
  return entries.map(([edge, x, y]) => ({ edge, x, y }));
}

function stripe(cx: number, cy: number, rx: number, ry: number): WireDecor {
  return { kind: 'spot', cx, cy, rx, ry, hue: STRIPE_HUE };
}

const HIND_LEG_LEFT: WirePlate = {
  id: 'leg-left',
  hue: BODY_HUE,
  outline: points([
    [0, 0],
    [34.93, 0],
    [42, 28],
    [38, 56],
    [32, 80],
    [56, 88],
    [64, 90],
    [54, 96],
    [64, 100],
    [44, 104],
    [52, 106],
    [22, 100],
    [10, 96],
    [4, 98],
    [16, 68],
    [12, 34],
  ]),
  curves: curves([
    [1, 41, 14],
    [2, 44, 42],
    [14, 18, 52],
    [15, 6, 17],
  ]),
  anchors: [{ name: 'attach', edge: 0 }],
  overlays: [
    {
      id: 'leg-left-claws',
      hue: CLAW_HUE,
      outline: points([
        [52, 86],
        [66, 90],
        [56, 92],
        [50, 94],
        [66, 100],
        [52, 102],
        [42, 102],
        [54, 106],
        [40, 106],
        [18, 100],
        [8, 94],
        [2, 98],
        [12, 98],
        [20, 102],
      ]),
    },
    {
      id: 'leg-left-foot-belly',
      hue: BELLY_HUE,
      outline: points([
        [30, 78],
        [40, 82],
        [44, 92],
        [24, 98],
        [16, 90],
      ]),
    },
  ],
  decor: [stripe(18, 22, 4.0, 8.5)],
};

const FOREARM_LEFT: WirePlate = {
  id: 'arm-left',
  hue: BODY_HUE,
  outline: points([
    [0, 0],
    [10.44, 0],
    [14, 10],
    [20, 18],
    [28, 16],
    [32, 15],
    [26, 20],
    [30, 24],
    [24, 25],
    [16, 20],
    [8, 10],
  ]),
  curves: curves([
    [1, 13, 5],
    [2, 19, 14],
  ]),
  anchors: [{ name: 'attach', edge: 0 }],
  overlays: [
    {
      id: 'arm-left-claws',
      hue: CLAW_HUE,
      outline: points([
        [25, 15],
        [34, 14],
        [26, 19],
        [32, 24],
        [23, 24],
      ]),
    },
  ],
};

const SKULL_LEFT: WirePlate = {
  id: 'skull-left',
  hue: BODY_HUE,
  outline: points([
    [0, 0],
    [78, 0],
    [110, 18],
    [114, 26],
    [54, 38],
    [102, 68],
    [96, 74],
    [74, 72],
    [44, 60],
    [13, 22],
  ]),
  curves: curves([
    [1, 96, 6],
    [6, 86, 75],
    [7, 60, 68],
    [8, 28, 44],
  ]),
  anchors: [
    { name: 'headSpine', edge: 0 },
    { name: 'neck', edge: 9 },
  ],
  overlays: [
    {
      id: 'mouth-cavity',
      hue: MOUTH_HUE,
      outline: points([
        [112, 26],
        [54, 38],
        [100, 67],
        [80, 52],
        [94, 36],
      ]),
    },
    {
      id: 'gum-yellow-upper',
      hue: GUM_HUE,
      outline: points([
        [113, 25],
        [53, 37],
        [55, 39],
        [111, 27],
      ]),
    },
    {
      id: 'gum-yellow-lower',
      hue: GUM_HUE,
      outline: points([
        [53, 37],
        [101, 67],
        [99, 69],
        [55, 39],
      ]),
    },
    {
      id: 'teeth-upper-jaw',
      hue: TEETH_HUE,
      outline: points([
        [55, 38],
        [61, 33],
        [66, 37],
        [72, 31],
        [77, 36],
        [83, 29],
        [88, 34],
        [94, 27],
        [99, 32],
        [105, 25],
        [108, 27],
        [102, 30],
        [96, 33],
        [90, 36],
        [84, 38],
        [68, 40],
        [55, 40],
      ]),
    },
    {
      id: 'teeth-lower-jaw',
      hue: TEETH_HUE,
      outline: points([
        [55, 38],
        [61, 44],
        [66, 40],
        [72, 47],
        [77, 42],
        [83, 50],
        [88, 45],
        [94, 54],
        [99, 48],
        [101, 67],
        [96, 60],
        [90, 55],
        [84, 50],
        [78, 46],
        [68, 42],
        [55, 40],
      ]),
    },
    {
      id: 'eye-ring',
      hue: TEETH_HUE,
      outline: points([
        [50, 16],
        [60, 16],
        [64, 21],
        [60, 26],
        [50, 26],
        [46, 21],
      ]),
    },
  ],
  decor: [
    { kind: 'eye', cx: 55, cy: 21, rx: 3.2, ry: 3.2, hue: CLAW_HUE },
    { kind: 'eye', cx: 56.2, cy: 19.8, rx: 1.0, ry: 1.0, hue: TEETH_HUE },
  ],
};

export const TYRANNOSAURUS_WIRE: WireFigure = {
  id: 'tyrannosaurus',
  name: 'Tiranossauro Rex',
  rootPlateId: 'flank-left',
  pitchAngle: 32,
  plates: [
    {
      id: 'flank-left',
      hue: BODY_HUE,
      outline: points([
        [0, 0],
        [175, 0],
        [188, 22],
        [172, 44],
        [162, 47],
        [132, 58],
        [114, 52],
        [82, 38],
        [52, 24],
        [24, 12],
      ]),
      curves: curves([
        [2, 184, 32],
        [4, 148, 54],
        [5, 122, 56],
        [7, 68, 30],
        [8, 38, 18],
        [9, 12, 6],
      ]),
      anchors: [
        { name: 'spine', edge: 0 },
        { name: 'neck', edge: 1 },
        { name: 'arm', edge: 3 },
        { name: 'hip', edge: 6 },
      ],
      overlays: [
        {
          id: 'flank-belly',
          hue: BELLY_HUE,
          outline: points([
            [54, 32],
            [96, 44],
            [130, 52],
            [158, 44],
            [170, 40],
            [184, 22],
            [188, 26],
            [172, 48],
            [158, 52],
            [130, 62],
            [98, 54],
            [52, 36],
          ]),
          curves: curves([
            [1, 114, 48],
            [2, 144, 48],
          ]),
        },
      ],
      decor: [
        stripe(16, 4, 1.8, 4.0),
        stripe(30, 7, 2.4, 5.5),
        stripe(46, 10, 3.0, 7.5),
        stripe(62, 14, 3.5, 9.5),
        stripe(78, 18, 4.0, 11.5),
        stripe(94, 22, 4.5, 13.0),
        stripe(110, 24, 4.8, 14.0),
        stripe(126, 22, 4.5, 13.0),
        stripe(142, 18, 4.0, 11.0),
        stripe(156, 13, 3.4, 8.5),
        stripe(168, 7, 2.6, 5.5),
      ],
    },
    { id: 'flank-right', hue: BODY_HUE, mirrorOf: 'flank-left' },
    SKULL_LEFT,
    { id: 'skull-right', hue: BODY_HUE, mirrorOf: 'skull-left' },
    HIND_LEG_LEFT,
    { id: 'leg-right', hue: BODY_HUE, mirrorOf: 'leg-left' },
    FOREARM_LEFT,
    { id: 'arm-right', hue: BODY_HUE, mirrorOf: 'arm-left' },
  ],
  hinges: [
    {
      id: 'spine',
      parentPlateId: 'flank-left',
      parentAnchor: 'spine',
      childPlateId: 'flank-right',
      childAnchor: 'spine',
      kind: 'mountain',
      angle: 125,
      stepOrder: 1,
      label: 'Backbone',
      description: 'Fold the flanks along the backbone (mountain crease at 125°).',
    },
    {
      id: 'neck',
      parentPlateId: 'flank-left',
      parentAnchor: 'neck',
      childPlateId: 'skull-left',
      childAnchor: 'neck',
      kind: 'mountain',
      angle: 20,
      stepOrder: 2,
      label: 'Neck joint',
      description: 'Set the head high and ready to bite over the neck.',
    },
    {
      id: 'skull-spine',
      parentPlateId: 'skull-left',
      parentAnchor: 'headSpine',
      childPlateId: 'skull-right',
      childAnchor: 'headSpine',
      kind: 'mountain',
      angle: 105,
      stepOrder: 2,
      label: 'Top of the skull',
      description: 'Close the skull at the top of the head, keeping the jaws wide open.',
    },
    {
      id: 'hinge-leg-left',
      parentPlateId: 'flank-left',
      parentAnchor: 'hip',
      childPlateId: 'leg-left',
      childAnchor: 'attach',
      kind: 'valley',
      angle: 78,
      stepOrder: 3,
      label: 'Hind legs',
      description: 'Fold the left leg vertically down to the ground.',
    },
    {
      id: 'hinge-leg-right',
      parentPlateId: 'flank-right',
      parentAnchor: 'hip',
      childPlateId: 'leg-right',
      childAnchor: 'attach',
      kind: 'valley',
      angle: 78,
      stepOrder: 3,
      label: 'Hind legs',
      description: 'Fold the right leg vertically down to the ground.',
    },
    {
      id: 'hinge-arm-left',
      parentPlateId: 'flank-left',
      parentAnchor: 'arm',
      childPlateId: 'arm-left',
      childAnchor: 'attach',
      kind: 'valley',
      angle: 60,
      stepOrder: 4,
      label: 'Short arms',
      description: 'Fold the left arm forward.',
    },
    {
      id: 'hinge-arm-right',
      parentPlateId: 'flank-right',
      parentAnchor: 'arm',
      childPlateId: 'arm-right',
      childAnchor: 'attach',
      kind: 'valley',
      angle: 60,
      stepOrder: 4,
      label: 'Short arms',
      description: 'Fold the right arm forward.',
    },
  ],
};

export const TYRANNOSAURUS: PaperFigure = parseWireFigure(TYRANNOSAURUS_WIRE, 'tier-7-10');
