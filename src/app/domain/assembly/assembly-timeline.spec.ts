import { describe, expect, it } from 'vitest';
import { entryBlend, exitBlend, faceFold, pieceMotion, stepPosition } from './assembly-timeline';

const piece = { progressStart: 0.2, progressEnd: 0.4 };

describe('pieceMotion', () => {
  it('should keep a piece waiting flat until its slice of the progress starts', () => {
    const motion = pieceMotion(piece, 0.1);
    expect(motion).toEqual({ fold: 0, travel: 0, waiting: true, arrived: false });
  });

  it('should fold the piece before it travels to its place', () => {
    const motion = pieceMotion(piece, 0.2 + 0.2 * 0.4);
    expect(motion.fold).toBe(1);
    expect(motion.travel).toBe(0);
  });

  it('should mark the piece as arrived once its slice is complete', () => {
    const motion = pieceMotion(piece, 0.7);
    expect(motion).toEqual({ fold: 1, travel: 1, waiting: false, arrived: true });
  });

  it('should already be in place while the camera holds on the finished piece', () => {
    expect(pieceMotion(piece, 0.2 + 0.2 * 0.85).arrived).toBe(true);
  });
});

describe('faceFold', () => {
  it('should never fold the root face of a tree', () => {
    expect(faceFold(1, 0, 3)).toBe(0);
  });

  it('should fold shallow hinges before deep ones', () => {
    expect(faceFold(0.5, 1, 4)).toBeGreaterThan(faceFold(0.5, 4, 4));
  });

  it('should complete every hinge when the piece is fully folded', () => {
    expect(faceFold(1, 4, 4)).toBe(1);
  });
});

describe('stepPosition', () => {
  it('should map the progress to a piece and its local time', () => {
    expect(stepPosition(0.5, 4)).toEqual({ index: 2, local: 0 });
    expect(stepPosition(0.375, 4).index).toBe(1);
  });

  it('should keep the last piece at its end when the progress is complete', () => {
    expect(stepPosition(1, 4)).toEqual({ index: 3, local: 1 });
  });
});

describe('camera blends', () => {
  it('should ease into a piece at the start and out of it at the end', () => {
    expect(entryBlend(0)).toBe(0);
    expect(entryBlend(0.5)).toBe(1);
    expect(exitBlend(0.5)).toBe(0);
    expect(exitBlend(1)).toBe(1);
  });
});
