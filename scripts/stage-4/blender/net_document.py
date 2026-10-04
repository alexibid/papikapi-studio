from math import degrees

from mathutils import Vector

MILLIMETRES_PER_METRE = 1000.0
FLAT_FOLD_DEG = 1.0
HINGE_TOLERANCE = 1e-5


def point_mm(vector):
    return [round(vector.x * MILLIMETRES_PER_METRE, 3), round(vector.y * MILLIMETRES_PER_METRE, 3)]


def fold_kind(face, neighbour):
    if degrees(face.normal.angle(neighbour.normal)) < FLAT_FOLD_DEG:
        return None
    bends_away = (neighbour.calc_center_median() - face.calc_center_median()).dot(face.normal) < 0
    return "mountain" if bends_away else "valley"


def is_hinge(edge, placement):
    first, second = edge.link_faces
    if first not in placement or second not in placement:
        return False
    return all((placement[first][vertex] - placement[second][vertex]).length < HINGE_TOLERANCE for vertex in edge.verts)


def piece_edges(placement):
    cuts, folds, seen = [], [], set()
    for face, positions in placement.items():
        for edge in face.edges:
            segment = [point_mm(positions[vertex]) for vertex in edge.verts]
            if len(edge.link_faces) != 2 or not is_hinge(edge, placement):
                cuts.append({"edge": edge.index, "face": face.index, "a": segment[0], "b": segment[1]})
            elif edge.index not in seen:
                seen.add(edge.index)
                first, second = edge.link_faces
                kind = fold_kind(first, second)
                if kind:
                    folds.append({"a": segment[0], "b": segment[1], "kind": kind})
    return cuts, folds


def build_piece(piece):
    faces = list(piece.placement)
    cuts, folds = piece_edges(piece.placement)
    area = sum(face.calc_area() for face in faces)
    centre = sum((face.calc_center_median() * face.calc_area() for face in faces), Vector()) / area
    normal = sum((face.normal * face.calc_area() for face in faces), Vector()).normalized()
    return {
        "faceIds": [face.index for face in faces],
        "faces": [[point_mm(piece.placement[face][vertex]) for vertex in face.verts] for face in faces],
        "cuts": cuts,
        "folds": folds,
        "areaMm2": round(area * MILLIMETRES_PER_METRE ** 2, 1),
        "centre": list(centre),
        "normal": list(normal),
    }
