import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from connectivity import face_records, vertex_records
from face_splitter import split_oversized_faces
from facet_colours import base_texture_pixels, transfer_facet_colours
from fold_cleanup import simplify_folds
from mesh_export import export_airtight_mesh_glb
from mesh_quality import measure_quality
from model_loader import load_grounded_mesh
from quad_conversion import join_triangles_into_quads
from scene_builder import build_scene
from surface_decimator import decimate_surface
from surface_repair import repair_surface

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def write_document(path, length, offset, surface, colours):
    document = {
        "lengthMeters": length,
        "groundOffset": list(offset),
        "vertices": vertex_records(surface),
        "faces": face_records(surface),
    }
    if colours:
        document["faceColours"] = colours
    Path(path).write_text(json.dumps(document, indent=2))


def within_tolerance(before, after, length, settings):
    allowance_mm = settings["fold_max_deviation_ratio"] * length * 1000
    return (
        after["airtight"]
        and after["maxDeviationMm"] - before["maxDeviationMm"] <= allowance_mm
        and after["featureLossMm"] - before["featureLossMm"] <= allowance_mm
        and abs(after["volumeChangePercent"] - before["volumeChangePercent"]) <= settings["fold_max_volume_percent"]
    )


def without_short_folds(surface, reference, length, settings):
    candidate = simplify_folds(surface.copy(), reference, length, settings)
    if within_tolerance(measure_quality(surface, reference), measure_quality(candidate, reference), length, settings):
        surface.free()
        return candidate
    candidate.free()
    return surface


def reduce_surface(surface, length, settings, reference):
    decimate_surface(surface, settings["target_faces"])
    if settings["min_fold_length_mm"] > 0:
        surface = without_short_folds(surface, reference, length, settings)
    join_triangles_into_quads(surface, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    split_oversized_faces(surface, length, settings["face_max_extent_ratio"])
    return surface


def main():
    settings = read_settings()
    surface, length, offset = load_grounded_mesh(settings)
    repair_surface(surface)
    pixels = base_texture_pixels()
    original_faces = len(surface.faces)
    reference = surface.copy()
    surface = reduce_surface(surface, length, settings, reference)
    quality = measure_quality(surface, reference)
    colours = transfer_facet_colours(surface, reference, pixels) if pixels is not None else []
    reference.free()
    write_document(settings["output_json"], length, offset, surface, colours)
    build_scene(surface, colours)
    export_airtight_mesh_glb(settings["output_glb"])
    statistics = {
        "lengthMm": round(length * 1000, 1),
        "faces": original_faces,
        "points": len(surface.verts),
        "facetColours": len(set(colours)),
        **quality,
    }
    surface.free()
    print(RESULT_MARKER + json.dumps(statistics))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
