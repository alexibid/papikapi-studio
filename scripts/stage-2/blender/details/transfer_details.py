"""s2-step-4 (details): repaints the essential details of the art on the model texture. Today: the eyes (visible eye of
the art, mirrored on both). The generic detail transfer will replace this case.

blender -b -P transfer_details.py -- '{"input_glb": ..., "art_image": ..., "output_glb": ..., ...parameters}'
The mesh is untouched; only the base colour texels around the two eyes change.
"""
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy
import numpy as np
from eye_image import visible_eye_decal
from eye_paint import decal_size, paint_eye
from eye_surface import eye_pair, read_surface

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def import_figure(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one mesh in {path}, found {len(meshes)}")
    return meshes[0]


def base_colour_node(figure):
    for material in figure.data.materials:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and any(link.to_socket.name == "Base Color" for link in node.outputs[0].links):
                return node
    raise RuntimeError("The model has no base colour texture")


def store_texture(node, texture: np.ndarray):
    """Saves the edited texels to a new PNG and links it to the material: the GLB exporter would otherwise
    re-embed the original packed image and drop the edits."""
    height, width = texture.shape[:2]
    edited = bpy.data.images.new("BaseColorEyes", width, height, alpha=True)
    edited.pixels.foreach_set(texture.ravel())
    path = os.path.join(tempfile.mkdtemp(), "base_color.png")
    edited.filepath_raw = path
    edited.file_format = "PNG"
    edited.save()
    node.image = bpy.data.images.load(path)
    node.image.pack()


def export(figure, path: str):
    bpy.ops.object.select_all(action="DESELECT")
    figure.select_set(True)
    bpy.context.view_layer.objects.active = figure
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_materials="EXPORT")


def main():
    settings = read_settings()
    decal = visible_eye_decal(settings["art_image"], settings)
    figure = import_figure(settings["input_glb"])
    node = base_colour_node(figure)
    surface = read_surface(figure.data, node.image)
    eyes = eye_pair(surface, decal["signature"], settings)
    painted = [paint_eye(surface, eye, decal, settings) for eye in eyes]
    store_texture(node, surface.texture)
    export(figure, settings["output_glb"])
    print(RESULT_MARKER + json.dumps({
        "artEyeSizesPx": decal["sizes_px"],
        "artAspect": round(decal["aspect"], 3),
        "modelEyeCentres": [[round(float(value), 4) for value in eye.centre] for eye in eyes],
        "eyeHeightToFigure": round(decal["height_to_figure"], 4),
        "modelEyeSize": [round(2 * size, 4) for size in decal_size(surface, decal)],
        "modelEyeNormals": [[round(float(value), 3) for value in eye.normal] for eye in eyes],
        "painted": painted,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
