import { AssemblyPiece } from './assembly-plan';

export interface PieceMotion {
  readonly fold: number;
  readonly travel: number;
  readonly waiting: boolean;
  readonly arrived: boolean;
}

const FOLD_SHARE = 0.4;
const TRAVEL_SHARE = 0.3;
const ENTRY_SHARE = 0.25;
const EXIT_SHARE = 0.25;
const DEPTH_WINDOW = 0.5;

export function pieceMotion(
  piece: Pick<AssemblyPiece, 'progressStart' | 'progressEnd'>,
  progress: number,
): PieceMotion {
  const span = piece.progressEnd - piece.progressStart;
  const local = clamp((progress - piece.progressStart) / span);
  return {
    fold: smooth(clamp(local / FOLD_SHARE)),
    travel: smooth(clamp((local - FOLD_SHARE) / TRAVEL_SHARE)),
    waiting: local === 0,
    arrived: local >= FOLD_SHARE + TRAVEL_SHARE,
  };
}

export interface StepPosition {
  readonly index: number;
  readonly local: number;
}

export function stepPosition(progress: number, stepCount: number): StepPosition {
  const scaled = clamp(progress) * stepCount;
  const index = Math.min(stepCount - 1, Math.floor(scaled));
  return { index, local: scaled - index };
}

export function entryBlend(local: number): number {
  return smooth(clamp(local / ENTRY_SHARE));
}

export function exitBlend(local: number): number {
  return smooth(clamp((local - (1 - EXIT_SHARE)) / EXIT_SHARE));
}

export function faceFold(fold: number, depth: number, maxDepth: number): number {
  if (depth === 0) {
    return 0;
  }
  const startsAt = ((depth - 1) / maxDepth) * DEPTH_WINDOW;
  return smooth(clamp((fold - startsAt) / (1 - DEPTH_WINDOW)));
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
