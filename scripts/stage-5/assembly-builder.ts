import { AssemblyOrder } from './assembly-order.js';
import { FoldTree } from './fold-tree.js';
import type {
  AssemblyChecks,
  AssemblyDocument,
  AssemblyParameters,
  AssemblyPiece,
  AssemblySource,
  AssemblySourcePiece,
  FaceGeometry,
  FoldedPiece,
  Vec2,
  Vec3,
} from './interfaces/assembly.interface.js';
import { PieceAdjacency } from './piece-adjacency.js';
import { TrayLayout } from './tray-layout.js';
import { VectorMath } from './vector-math.js';

const MM_PER_METRE = 1000;

export class AssemblyBuilder {
  public static faceGeometries(source: AssemblySource): readonly FaceGeometry[] {
    return source.pieces.flatMap((piece) => this.pieceGeometries(source, piece));
  }

  public static compose(
    source: AssemblySource,
    geometries: readonly FaceGeometry[],
    colours: ReadonlyMap<number, string>,
    parameters: AssemblyParameters,
  ): AssemblyDocument {
    const neighbours = PieceAdjacency.neighbours(source);
    const folded = new Map<number, FoldedPiece>();
    const solids = new Map<number, readonly Vec3[]>();

    for (const piece of source.pieces) {
      const faces = this.pieceGeometries(source, piece);
      folded.set(piece.number, FoldTree.build(faces, parameters.hinge_tolerance_mm));
      solids.set(
        piece.number,
        faces.flatMap((face) => face.solid),
      );
    }

    const lastPieceNumber = source.pieces.length;
    const isPlinthLast = source.pieces.some(
      (p) => p.number === lastPieceNumber && p.faces.length === 5,
    );
    const sequence = AssemblyOrder.sequence(
      source.pieces.map((piece) => ({
        number: piece.number,
        centreHeight: VectorMath.centroid(solids.get(piece.number) ?? [])[2],
        neighbours: neighbours.get(piece.number) ?? new Set<number>(),
      })),
      isPlinthLast ? lastPieceNumber : undefined,
    );
    const ordered = sequence.map(
      (number) => source.pieces.find((piece) => piece.number === number) as AssemblySourcePiece,
    );
    const bounds = ordered.map((piece) => this.flatBounds(piece));
    const trays = TrayLayout.place(
      bounds.map((box) => ({ size: box.size, origin: box.origin })),
      Math.min(...geometries.flatMap((face) => face.solid.map((point) => point[1]))),
      parameters,
    );
    const pieces = ordered.map((piece, position): AssemblyPiece => ({
      number: piece.number,
      areaMm2: piece.areaMm2,
      faces: (folded.get(piece.number) as FoldedPiece).faces.map((face) => ({
        ...face,
        colour: colours.get(face.id) as string,
      })),
      centre: VectorMath.centroid(solids.get(piece.number) ?? []),
      tray: trays[position],
      size: bounds[position].size,
      progressStart: position / ordered.length,
      progressEnd: (position + 1) / ordered.length,
    }));

    return {
      dimensionsMm: source.dimensionsMm,
      pieces,
      checks: this.checks(pieces, [...folded.values()]),
    };
  }

  private static pieceGeometries(
    source: AssemblySource,
    piece: AssemblySourcePiece,
  ): readonly FaceGeometry[] {
    return piece.faceIds.map((id, index) => ({
      id,
      flat: piece.faces[index],
      vertexIds: source.mesh.faces[id],
      solid: source.mesh.faces[id].map((vertex) =>
        VectorMath.scale(source.mesh.vertices[vertex], MM_PER_METRE),
      ),
    }));
  }

  private static flatBounds(piece: AssemblySourcePiece): { size: Vec2; origin: Vec2 } {
    const points = piece.faces.flat();
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const origin: Vec2 = [Math.min(...xs), Math.min(...ys)];
    return { origin, size: [Math.max(...xs) - origin[0], Math.max(...ys) - origin[1]] };
  }

  private static checks(
    pieces: readonly AssemblyPiece[],
    folded: readonly FoldedPiece[],
  ): AssemblyChecks {
    const faces = pieces.reduce((sum, piece) => sum + piece.faces.length, 0);
    const extraRoots = folded.reduce((sum, piece) => sum + piece.extraRoots, 0);
    return {
      pieces: pieces.length,
      faces,
      hinges: faces - pieces.length - extraRoots,
      maxHingeResidualMm: Math.round(Math.max(...folded.map((p) => p.residualMm)) * 1000) / 1000,
      maxFoldAngleDeg:
        Math.round(Math.max(...folded.map((p) => p.maxAngleRad)) * (180 / Math.PI) * 10) / 10,
      mirroredPieces: folded.filter((piece) => piece.mirrored).length,
      extraRoots,
    };
  }
}
