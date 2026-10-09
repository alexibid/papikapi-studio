import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "key_points"))
sys.path.insert(0, str(Path(__file__).parents[3] / "stage-2" / "blender" / "base"))
sys.path.insert(0, str(Path(__file__).parents[3] / "common" / "blender"))

import bmesh
import bpy

from baking import clear_scene, import_model
from connectivity import face_records, vertex_records
from face_splitter import split_oversized_faces
from mesh_quality import open_and_non_manifold_edges
from white_plinth import add_white_plinth

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
WHITE = (1.0, 1.0, 1.0, 1.0)
WELD_DISTANCE = 1e-7


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def build_reduced_mesh(settings):
    document = json.loads(Path(settings["input_mesh"]).read_text())
    surface = bmesh.new()
    vertices = [surface.verts.new(vertex["position"]) for vertex in document["vertices"]]
    for indices in document["faces"]:
        surface.faces.new([vertices[index] for index in indices])
    lowest = min(vertex.co.z for vertex in surface.verts)
    if abs(lowest) > 1e-5:
        bmesh.ops.translate(surface, vec=(0, 0, -lowest), verts=surface.verts)
        surface.normal_update()
    split_oversized_faces(surface, document["lengthMeters"], settings["face_max_extent_ratio"])
    statistics = add_white_plinth(surface, settings, document["lengthMeters"], 0)
    plinth_face_ids = [face.index for face in statistics["plinth_faces"]]
    document_out = {
        "lengthMeters": document["lengthMeters"],
        "vertices": vertex_records(surface),
        "faces": face_records(surface),
        "plinthFaceIds": plinth_face_ids,
        "plinth": {
            "bounds": list(statistics["bounds"]),
            "thickness": statistics["thickness"],
        },
    }
    Path(settings["output_json"]).write_text(json.dumps(document_out, indent=2))
    open_edges, non_manifold = open_and_non_manifold_edges(surface)
    result = {
        "faces": len(surface.faces),
        "openEdges": open_edges,
        "nonManifoldEdges": non_manifold,
        "thickness": statistics["thickness"],
        "loops": statistics["loops"],
    }
    surface.free()
    return result, document["lengthMeters"]


def white_material():
    material = bpy.data.materials.new("PlinthWhite")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = WHITE
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def textured_figure(settings, length):
    clear_scene()
    figure = import_model(settings["input_glb"])
    surface = bmesh.new()
    surface.from_mesh(figure.data)
    bmesh.ops.remove_doubles(surface, verts=surface.verts, dist=WELD_DISTANCE)
    lowest = min(vertex.co.z for vertex in surface.verts)
    if abs(lowest) > 1e-5:
        bmesh.ops.translate(surface, vec=(0, 0, -lowest), verts=surface.verts)
        surface.normal_update()
    add_white_plinth(surface, settings, length, len(figure.data.materials))
    surface.to_mesh(figure.data)
    surface.free()
    figure.data.materials.append(white_material())
    for polygon in figure.data.polygons:
        polygon.use_smooth = False
    return figure


def export_glb(figure, path):
    bpy.ops.object.select_all(action="DESELECT")
    figure.select_set(True)
    bpy.context.view_layer.objects.active = figure
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT", export_image_format="AUTO")


def main():
    settings = read_settings()
    result, length = build_reduced_mesh(settings)
    export_glb(textured_figure(settings, length), settings["output_glb"])
    print(RESULT_MARKER + json.dumps(result))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
