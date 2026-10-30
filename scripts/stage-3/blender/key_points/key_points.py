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
from outer_shell import keep_outer_surface
from mesh_quality import enclosed_volume, measure_quality, outside_distance
from model_loader import load_grounded_mesh
from quad_conversion import join_triangles_into_quads
from quality_gates import gate_failures
from scene_builder import build_scene
from surface_decimator import decimate_surface
from surface_repair import repair_surface
from volume_restore import restore_volume
from watertight_remesh import watertight_copy

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


def organic_candidate(surface, length, faces, settings):
    candidate = surface.copy()
    decimate_surface(candidate, faces)
    repair_surface(candidate)
    restore_volume(candidate, enclosed_volume(surface))
    join_triangles_into_quads(candidate, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    split_oversized_faces(candidate, length, settings["face_max_extent_ratio"])
    return candidate


def reduce_organic(surface, length, settings):
    """Fewest faces that keep the figure: grows the face budget until every gate passes."""
    faces, attempts = settings["target_faces"], []
    while faces <= settings["max_faces"]:
        candidate = organic_candidate(surface, length, faces, settings)
        quality = measure_quality(candidate, surface)
        failures = gate_failures(quality, settings)
        attempts.append({"targetFaces": faces, "meshFaces": quality["meshFaces"],
                         "volumeChangePercent": quality["volumeChangePercent"],
                         "featureLossMm": quality["featureLossMm"], "failures": failures})
        if not failures:
            return candidate, attempts
        candidate.free()
        faces = int(round(faces * settings["face_growth"]))
    raise RuntimeError(f"No face budget up to {settings['max_faces']} keeps the figure: {attempts}")


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
        return reduce_blocky(surface.copy(), length, settings), []
    if mode == "planar":
        return reduce_planar(surface.copy(), length, settings), []
    return reduce_organic(surface, length, settings)


def main():
    settings = read_settings()
    surface, length, offset = load_grounded_mesh(settings)
    inner_wall_share = keep_outer_surface(surface, length, settings["min_inner_wall_share"])
    repair_surface(surface)
    closed = watertight_copy(surface, length * settings["remesh_voxel_ratio"])
    closing_deviation_mm = round(1000 * outside_distance(closed, surface), 2)
    if closing_deviation_mm > 1000 * length * settings["max_closing_deviation_ratio"]:
        raise RuntimeError(f"Closing the figure moved it {closing_deviation_mm} mm away from the stage-2 shape")
    surface.free()
    surface = closed
    mode, aligned_ratio = resolve_mode(surface, settings)
    if mode == "boxes":
        offset = remove_slab(surface, length, offset, settings)
    original_faces = len(surface.faces)
    reference = surface
    surface, attempts = reduce_surface(reference, length, mode, settings)
    quality = measure_quality(surface, reference)
    reference.free()
    failures = gate_failures(quality, settings)
    if failures:
        raise RuntimeError(f"Simplified figure fails the gates: {failures}")
    write_document(settings["output_json"], length, offset, surface)
    build_scene(surface)
    export_airtight_mesh_glb(settings["output_glb"])
    statistics = {
        "lengthMm": round(length * 1000, 1),
        "faces": original_faces,
        "points": len(surface.verts),
        "mode": mode,
        "alignedAreaRatio": round(aligned_ratio, 3),
        "innerWallShare": round(inner_wall_share, 3),
        "closingDeviationMm": closing_deviation_mm,
        "attempts": attempts,
        **quality,
    }
    surface.free()
    print(RESULT_MARKER + json.dumps(statistics))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
