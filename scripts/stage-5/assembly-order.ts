import type { OrderedPiece } from './interfaces/assembly.interface.js';

export class AssemblyOrder {
  public static sequence(pieces: readonly OrderedPiece[]): readonly number[] {
    const remaining = new Map(pieces.map((piece) => [piece.number, piece]));
    const built = new Set<number>();
    const sequence: number[] = [];

    while (remaining.size > 0) {
      const candidates = [...remaining.values()];
      const touching = candidates.filter((piece) =>
        [...piece.neighbours].some((neighbour) => built.has(neighbour)),
      );
      const pool = touching.length > 0 ? touching : candidates;
      const next = pool.reduce((lowest, piece) =>
        piece.centreHeight < lowest.centreHeight ? piece : lowest,
      );
      remaining.delete(next.number);
      built.add(next.number);
      sequence.push(next.number);
    }
    return sequence;
  }
}
