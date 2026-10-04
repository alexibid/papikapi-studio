import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from connectivity import face_records, vertex_records
from face_splitter import split_oversized_faces
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


def write_document(path, length, offset, surface):
    document = {
        "lengthMeters": length,
        "groundOffset": list(offset),
        "vertices": vertex_records(surface),
        "faces": face_records(surface),
    }
    Path(path).write_text(json.dumps(document, indent=2))


def main():
    settings = read_settings()
    surface, length, offset = load_grounded_mesh(settings)
    repair_surface(surface)
    original_faces = len(surface.faces)
    reference = surface.copy()
    decimate_surface(surface, settings["target_faces"])
    join_triangles_into_quads(surface, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    split_oversized_faces(surface, length, settings["face_max_extent_ratio"])
    quality = measure_quality(surface, reference)
    reference.free()
    write_document(settings["output_json"], length, offset, surface)
    build_scene(surface)
    export_airtight_mesh_glb(settings["output_glb"])
    statistics = {
        "lengthMm": round(length * 1000, 1),
        "faces": original_faces,
        "points": len(surface.verts),
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
