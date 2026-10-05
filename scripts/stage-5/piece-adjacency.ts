import type { AssemblySource } from './interfaces/assembly.interface.js';

export class PieceAdjacency {
  public static neighbours(source: AssemblySource): ReadonlyMap<number, ReadonlySet<number>> {
    const pieceOfFace = new Map<number, number>();
    for (const piece of source.pieces) {
      piece.faceIds.forEach((faceId) => pieceOfFace.set(faceId, piece.number));
    }

    const piecesOfEdge = new Map<string, Set<number>>();
    source.mesh.faces.forEach((vertices, faceId) => {
      const owner = pieceOfFace.get(faceId);
      if (owner === undefined) return;
      vertices.forEach((vertex, index) => {
        const next = vertices[(index + 1) % vertices.length];
        const key = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
        piecesOfEdge.set(key, (piecesOfEdge.get(key) ?? new Set<number>()).add(owner));
      });
    });

    const neighbours = new Map<number, Set<number>>(
      source.pieces.map((piece) => [piece.number, new Set<number>()]),
    );
    for (const owners of piecesOfEdge.values()) {
      for (const first of owners) {
        for (const second of owners) {
          if (first !== second) neighbours.get(first)?.add(second);
        }
      }
    }
    return neighbours;
  }
}
