import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh
import bpy

from manifold_repair import repair_manifold
from net_export import export_net
from net_plinth import find_plinth_faces
from papercraft_mesh import build_papercraft, rebuild_canonically
from quad_flattening import flatten_quads, triangulate_twisted

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
MILLIMETRES_PER_METRE = 1000.0
SQUARE_METRES_PER_SQUARE_MILLIMETRE = 1e-6
DEGENERATE_DISTANCE = 1e-6
MAX_COLLAPSE_PASSES = 50


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_simplified_mesh(mesh_path):
    document = json.loads(Path(mesh_path).read_text())
    return build_papercraft({"vertices": [vertex["position"] for vertex in document["vertices"]], "faces": document["faces"]})


def scale_longest_side(target, target_size_mm):
    factor = (target_size_mm / MILLIMETRES_PER_METRE) / max(target.dimensions)
    target.scale = (factor, factor, factor)
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return factor


def collapse_tiny_faces(mesh_builder, min_area_m2):
    for _ in range(MAX_COLLAPSE_PASSES):
        mesh_builder.faces.ensure_lookup_table()
        tiny = [face for face in mesh_builder.faces if face.calc_area() < min_area_m2]
        if not tiny:
            return
        shortest_edges = {min(face.edges, key=lambda edge: edge.calc_length()) for face in tiny}
        bmesh.ops.collapse(mesh_builder, edges=list(shortest_edges))
        bmesh.ops.dissolve_degenerate(mesh_builder, edges=mesh_builder.edges, dist=DEGENERATE_DISTANCE)
    raise RuntimeError("Tiny faces remain after mesh repair")


def weld_and_clean(target, settings):
    mesh_builder = bmesh.new()
    mesh_builder.from_mesh(target.data)
    bmesh.ops.remove_doubles(
        mesh_builder,
        verts=mesh_builder.verts,
        dist=settings["weld_distance_mm"] / MILLIMETRES_PER_METRE,
    )
    bmesh.ops.dissolve_degenerate(mesh_builder, edges=mesh_builder.edges, dist=DEGENERATE_DISTANCE)
    collapse_tiny_faces(mesh_builder, settings["min_face_area_mm2"] * SQUARE_METRES_PER_SQUARE_MILLIMETRE)
    flatten_quads(mesh_builder, settings["flatten_iterations"])
    triangulate_twisted(mesh_builder)
    repair_manifold(mesh_builder)
    loose =[vertex for vertex in mesh_builder.verts if not vertex.link_faces]
    bmesh.ops.delete(mesh_builder, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(mesh_builder, faces=mesh_builder.faces)
    mesh_builder.to_mesh(target.data)
    mesh_builder.free()
    target.data.update()


def count_non_manifold_edges(target):
    mesh_builder = bmesh.new()
    mesh_builder.from_mesh(target.data)
    total = sum(1 for edge in mesh_builder.edges if not edge.is_manifold)
    mesh_builder.free()
    return total


def build_statistics(target, settings):
    dimensions_mm = [side * MILLIMETRES_PER_METRE for side in target.dimensions]
    return {
        "faceCount": len(target.data.polygons),
        "quadCount": sum(1 for polygon in target.data.polygons if len(polygon.vertices) == 4),
        "vertexCount": len(target.data.vertices),
        "nonManifoldEdges": count_non_manifold_edges(target),
        "dimensionsMm": [round(side, 2) for side in dimensions_mm],
        "targetSizeMm": settings["target_size_mm"],
    }


def main():
    settings = read_settings()
    clear_scene()
    papercraft = import_simplified_mesh(settings["input_mesh"])
    factor = scale_longest_side(papercraft, settings["target_size_mm"])

    mesh_builder = bmesh.new()
    mesh_builder.from_mesh(papercraft.data)
    plinth_faces = find_plinth_faces(mesh_builder)

    if plinth_faces:
        plinth_set = set(plinth_faces)
        fig_bmesh = bmesh.new()
        v_map = {}
        for f in mesh_builder.faces:
            if f not in plinth_set:
                for v in f.verts:
                    if v not in v_map:
                        v_map[v] = fig_bmesh.verts.new(v.co)
                fig_bmesh.faces.new([v_map[v] for v in f.verts])
        fig_bmesh.normal_update()

        plinth_bmesh = bmesh.new()
        pv_map = {}
        for f in plinth_faces:
            for v in f.verts:
                if v not in pv_map:
                    pv_map[v] = plinth_bmesh.verts.new(v.co)
            plinth_bmesh.faces.new([pv_map[v] for v in f.verts])
        plinth_bmesh.normal_update()
        mesh_builder.free()

        orig_mesh = papercraft.data
        bpy.data.objects.remove(papercraft, do_unlink=True)
        bpy.data.meshes.remove(orig_mesh)

        fig_mesh = bpy.data.meshes.new("Figure")
        fig_bmesh.to_mesh(fig_mesh)
        fig_bmesh.free()
        fig_obj = bpy.data.objects.new("Figure", fig_mesh)
        bpy.context.scene.collection.objects.link(fig_obj)

        weld_and_clean(fig_obj, settings)
        fig_obj = rebuild_canonically(fig_obj)

        plinth_mesh = bpy.data.meshes.new("Plinth")
        plinth_bmesh.to_mesh(plinth_mesh)
        plinth_bmesh.free()
        plinth_obj = bpy.data.objects.new("Plinth", plinth_mesh)
        bpy.context.scene.collection.objects.link(plinth_obj)

        bpy.ops.object.select_all(action="DESELECT")
        fig_obj.select_set(True)
        plinth_obj.select_set(True)
        bpy.context.view_layer.objects.active = fig_obj
        bpy.ops.object.join()
        papercraft = fig_obj
    else:
        mesh_builder.free()
        weld_and_clean(papercraft, settings)
        papercraft = rebuild_canonically(papercraft)

    statistics = {**build_statistics(papercraft, settings), **export_net(papercraft, settings, factor)}
    print(RESULT_MARKER + json.dumps(statistics))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
