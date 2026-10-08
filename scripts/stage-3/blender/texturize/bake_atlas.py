import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy
import numpy as np
from optimized_surface import import_optimized_model, sample_nearest_surface
from reduced_mesh import build_reduced_object, texels_of, unwrap

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
BLEED_PIXELS = 16


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def extend_margin(image: np.ndarray, covered: np.ndarray) -> np.ndarray:
    for _ in range(BLEED_PIXELS):
        total, count = np.zeros_like(image), np.zeros(covered.shape)
        for shift in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            total += np.roll(image * covered[..., None], shift, (0, 1))
            count += np.roll(covered, shift, (0, 1))
        fill = ~covered & (count > 0)
        image[fill] = total[fill] / count[fill][:, None]
        covered = covered | fill
    return image


def compose_atlas(resolution: int, rows, columns, colours) -> np.ndarray:
    texels = np.zeros((resolution, resolution, 3), dtype=np.float32)
    covered = np.zeros((resolution, resolution), dtype=bool)
    texels[rows, columns] = colours
    covered[rows, columns] = True
    return extend_margin(texels, covered)


def attach_atlas(reduced, texels: np.ndarray) -> None:
    resolution = texels.shape[0]
    pixels = np.ones((resolution, resolution, 4), dtype=np.float32)
    pixels[:, :, :3] = texels
    image = bpy.data.images.new("Atlas", resolution, resolution, alpha=False)
    image.file_format = "PNG"
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    material = bpy.data.materials.new("Atlas")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Metallic"].default_value = 0.0
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    reduced.data.materials.append(material)


def export_reduced(reduced, output_glb: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    reduced.select_set(True)
    bpy.context.view_layer.objects.active = reduced
    bpy.ops.export_scene.gltf(
        filepath=output_glb, export_format="GLB", use_selection=True, export_image_format="AUTO"
    )


def execute_bake(settings: dict) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    figure = import_optimized_model(settings["base_glb"])
    reduced = build_reduced_object(settings["reduce_json"])
    unwrap(reduced)
    resolution = int(settings["resolution"])
    rows, columns, points = texels_of(reduced, resolution)
    colours = sample_nearest_surface(figure, points)
    attach_atlas(reduced, compose_atlas(resolution, rows, columns, colours))
    export_reduced(reduced, settings["output_glb"])
    return {"faces": len(reduced.data.polygons), "resolution": resolution}


if __name__ == "__main__":
    try:
        print(RESULT_MARKER + json.dumps(execute_bake(read_settings())))
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
