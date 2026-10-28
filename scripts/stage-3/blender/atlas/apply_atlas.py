"""s3-step-3 (texturize): applies the simplified atlas and UVs to the simplified figure and exports the final textured GLB.

blender -b -P apply_atlas.py -- '{"input_glb", "atlas_png", "uv_json", "output_glb"}'
"""
import json
import sys
import traceback
from pathlib import Path

import bpy

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def main():
    settings = read_settings()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=settings["input_glb"])

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {settings['input_glb']}")

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    figure = bpy.context.view_layer.objects.active

    # Apply UVs if uv_json is provided
    uv_json_path = settings.get("uv_json")
    if uv_json_path and Path(uv_json_path).exists():
        with open(uv_json_path) as handle:
            uv_data = json.load(handle)
        mesh = figure.data
        uv_layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
        faces_uvs = uv_data.get("faces", [])
        if len(faces_uvs) == len(mesh.polygons):
            for poly, loop_uvs in zip(mesh.polygons, faces_uvs):
                for loop_idx, uv in zip(poly.loop_indices, loop_uvs):
                    uv_layer.data[loop_idx].uv = uv

    # Load atlas texture
    atlas = bpy.data.images.load(settings["atlas_png"])
    atlas.pack()

    # Create cardstock textured material
    material = bpy.data.materials.new("Atlas")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Roughness"].default_value = 1.0
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.0
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = 0.0

    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = atlas
    material.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    figure.data.materials.clear()
    figure.data.materials.append(material)

    for polygon in figure.data.polygons:
        polygon.use_smooth = False

    bpy.ops.object.select_all(action="DESELECT")
    figure.select_set(True)
    bpy.context.view_layer.objects.active = figure
    bpy.ops.export_scene.gltf(
        filepath=settings["output_glb"],
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
    )
    print(RESULT_MARKER + json.dumps({"faces": len(figure.data.polygons)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
