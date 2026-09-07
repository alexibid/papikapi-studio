const POINT = {
  type: 'OBJECT',
  properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
  required: ['x', 'y'],
} as const;

const CURVE = {
  type: 'OBJECT',
  properties: { edge: { type: 'NUMBER' }, x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
  required: ['edge', 'x', 'y'],
} as const;

const ANCHOR = {
  type: 'OBJECT',
  properties: { name: { type: 'STRING' }, edge: { type: 'NUMBER' } },
  required: ['name', 'edge'],
} as const;

const DECOR = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['spot', 'eye'] },
    cx: { type: 'NUMBER' },
    cy: { type: 'NUMBER' },
    rx: { type: 'NUMBER' },
    ry: { type: 'NUMBER' },
    hue: { type: 'STRING' },
  },
  required: ['kind', 'cx', 'cy', 'rx', 'ry', 'hue'],
} as const;

const OVERLAY = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    hue: { type: 'STRING' },
    outline: { type: 'ARRAY', items: POINT },
    curves: { type: 'ARRAY', items: CURVE },
  },
  required: ['id', 'hue', 'outline'],
} as const;

const PLATE = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    hue: { type: 'STRING' },
    mirrorOf: { type: 'STRING' },
    outline: { type: 'ARRAY', items: POINT },
    curves: { type: 'ARRAY', items: CURVE },
    anchors: { type: 'ARRAY', items: ANCHOR },
    overlays: { type: 'ARRAY', items: OVERLAY },
    decor: { type: 'ARRAY', items: DECOR },
  },
  required: ['id', 'hue'],
} as const;

const HINGE = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    parentPlateId: { type: 'STRING' },
    parentAnchor: { type: 'STRING' },
    childPlateId: { type: 'STRING' },
    childAnchor: { type: 'STRING' },
    kind: { type: 'STRING', enum: ['mountain', 'valley'] },
    angle: { type: 'NUMBER' },
    stepOrder: { type: 'NUMBER' },
    label: { type: 'STRING' },
    description: { type: 'STRING' },
  },
  required: ['id', 'parentPlateId', 'parentAnchor', 'childPlateId', 'childAnchor', 'kind'],
} as const;

export const FIGURE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    name: { type: 'STRING' },
    rootPlateId: { type: 'STRING' },
    pitchAngle: { type: 'NUMBER' },
    plates: { type: 'ARRAY', items: PLATE },
    hinges: { type: 'ARRAY', items: HINGE },
  },
  required: ['id', 'name', 'rootPlateId', 'plates', 'hinges'],
} as const;
