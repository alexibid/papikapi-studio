import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from blockiness import aligned_area_ratio
from box_slab import remove_slab
from box_yaw import estimate_yaw
from box_surface import triangulate_polygons
from box_union import fit_box_union
from connectivity import face_records, vertex_records
from face_splitter import split_oversized_faces
from planar_reduction import reduce_planar
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


def reduce_organic(surface, length, settings):
    decimate_surface(surface, settings["target_faces"])
    join_triangles_into_quads(surface, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    split_oversized_faces(surface, length, settings["face_max_extent_ratio"])
    return surface


def reduce_blocky(surface, length, settings):
    union = fit_box_union(surface, length, settings)
    surface.free()
    triangulate_polygons(union)
    join_triangles_into_quads(union, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    return union


def resolve_mode(surface, settings):
    ratio = aligned_area_ratio(surface, estimate_yaw(surface))
    if settings["mode"] == "auto":
        return ("boxes" if ratio >= settings["box_min_aligned_ratio"] else "planar"), ratio
    return settings["mode"], ratio


def reduce_surface(surface, length, mode, settings):
    if mode == "boxes":
        return reduce_blocky(surface, length, settings)
    if mode == "planar":
        return reduce_planar(surface, length, settings)
    return reduce_organic(surface, length, settings)


def main():
    settings = read_settings()
    surface, length, offset = load_grounded_mesh(settings)
    repair_surface(surface)
    mode, aligned_ratio = resolve_mode(surface, settings)
    if mode == "boxes":
        offset = remove_slab(surface, length, offset, settings)
    original_faces = len(surface.faces)
    reference = surface.copy()
    surface = reduce_surface(surface, length, mode, settings)
    quality = measure_quality(surface, reference)
    reference.free()
    write_document(settings["output_json"], length, offset, surface)
    build_scene(surface)
    export_airtight_mesh_glb(settings["output_glb"])
    statistics = {
        "lengthMm": round(length * 1000, 1),
        "faces": original_faces,
        "points": len(surface.verts),
        "mode": mode,
        "alignedAreaRatio": round(aligned_ratio, 3),
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
