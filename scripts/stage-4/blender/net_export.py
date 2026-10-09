import json
from math import dist
from pathlib import Path

import bmesh

from net_assembly import order_and_number
from net_document import build_piece
from net_plinth import create_plinth_piece, find_plinth_faces
from net_unfolding import unfold_pieces
from papercraft_mesh import mesh_to_document

MILLIMETRES_PER_METRE = 1000.0


def validation(pieces):
    occurrences = {}
    for piece in pieces:
        for cut in piece["cuts"]:
            occurrences[cut["edge"]] = occurrences.get(cut["edge"], 0) + 1
    lengths = [dist(cut["a"], cut["b"]) for piece in pieces for cut in piece["cuts"]]
    return {
        "pieces": len(pieces),
        "smallestPieceFaces": min(len(piece["faceIds"]) for piece in pieces),
        "shortestCutMm": round(min(lengths), 1),
        "unpairedEdges": sum(1 for count in occurrences.values() if count != 2),
    }


def export_net(target, settings, scale):
    mesh_builder = bmesh.new()
    mesh_builder.from_mesh(target.data)
    mesh_builder.normal_update()
    mesh_builder.faces.index_update()
    mesh_builder.edges.index_update()
    limits = {
        "page": (settings["piece_max_width_mm"] / MILLIMETRES_PER_METRE, settings["piece_max_height_mm"] / MILLIMETRES_PER_METRE),
        "compactness": settings["piece_compactness"],
    }

    plinth_faces = find_plinth_faces(mesh_builder)
    if plinth_faces:
        plinth_set = set(plinth_faces)
        figure_faces = [face for face in mesh_builder.faces if face not in plinth_set]
        figure_pieces = [build_piece(piece) for piece in unfold_pieces(mesh_builder, limits, faces=figure_faces)]
        plinth_piece = build_piece(create_plinth_piece(plinth_faces))
        raw_pieces = [plinth_piece] + figure_pieces
        pieces = order_and_number(raw_pieces, has_plinth=True)
    else:
        raw_pieces = [build_piece(piece) for piece in unfold_pieces(mesh_builder, limits)]
        pieces = order_and_number(raw_pieces, has_plinth=False)
    mesh_builder.free()
    checks = validation(pieces)
    document = {
        "dimensionsMm": [round(side * MILLIMETRES_PER_METRE, 1) for side in target.dimensions],
        "checks": checks,
        "meshScale": scale,
        "mesh": mesh_to_document(target.data),
        "pieces": pieces,
    }
    Path(settings["output_net"]).write_text(json.dumps(document))
    return checks
