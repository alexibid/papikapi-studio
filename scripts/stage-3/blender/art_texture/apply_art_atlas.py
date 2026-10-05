import json
import sys
import traceback
from pathlib import Path

import bpy

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
MESH_NAME = "ArtTextured"


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def build_mesh(document, uv_document):
    mesh = bpy.data.meshes.new(MESH_NAME)
    vertices = [vertex["position"] for vertex in document["vertices"]]
    mesh.from_pydata(vertices, [], document["faces"])
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        polygon.use_smooth = False
        for corner, uv in zip(polygon.loop_indices, uv_document["faces"][polygon.index]):
            layer.data[corner].uv = uv
    return mesh


def atlas_material(atlas_path):
    material = bpy.data.materials.new("ArtAtlas")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(atlas_path)
    texture.interpolation = "Closest"
    texture.extension = "EXTEND"
    emission = nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def export(item, path):
    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_materials="EXPORT", export_image_format="AUTO",
    )


def main():
    settings = read_settings()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    document = json.loads(Path(settings["input_mesh"]).read_text())
    uv_document = json.loads(Path(settings["uv_json"]).read_text())
    mesh = build_mesh(document, uv_document)
    mesh.materials.append(atlas_material(str(Path(settings["uv_json"]).parent / uv_document["atlas"])))
    item = bpy.data.objects.new(MESH_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    export(item, settings["output_glb"])
    print(RESULT_MARKER + json.dumps({"faces": len(mesh.polygons)}))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
