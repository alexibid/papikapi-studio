import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[2] / "common" / "blender"))

import bpy

from baking import (
    attach_image_material,
    bake_colour,
    build_cage,
    clear_scene,
    create_image,
    emissive_to_albedo,
    import_model,
    remove_metal,
    triangulate,
)
from page_uv import assign_page_uv
from papercraft_mesh import build_papercraft

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
WHITE = (1.0, 1.0, 1.0, 1.0)


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def scale_source(source, factor):
    source.scale = (factor, factor, factor)
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def page_images(layout, settings, target):
    width = round(layout["pageWidthMm"] * settings["pixels_per_mm"])
    height = round(layout["pageHeightMm"] * settings["pixels_per_mm"])
    images = [create_image(f"page-{index + 1:02d}", width, height, WHITE) for index in range(layout["pages"])]
    for image in images:
        attach_image_material(target, image.name, image)
    return images


def save_images(images, settings):
    render = bpy.context.scene.render.image_settings
    render.file_format = "JPEG"
    render.quality = settings["jpeg_quality"]
    bpy.context.scene.view_settings.view_transform = "Standard"
    output = Path(settings["output_dir"])
    output.mkdir(parents=True, exist_ok=True)
    paths = [str(output / f"{image.name}.jpg") for image in images]
    for image, path in zip(images, paths):
        image.save_render(path, scene=bpy.context.scene)
    return paths


def main():
    settings = read_settings()
    net = json.loads(Path(settings["input_net"]).read_text())
    layout = json.loads(Path(settings["input_layout"]).read_text())
    clear_scene()
    source = import_model(settings["input_glb"])
    source.name = "SourceModel"
    remove_metal(source)
    emissive_to_albedo(source)
    scale_source(source, net["meshScale"])
    target = build_papercraft(net["mesh"])
    target.name = "TargetPapercraft"
    images = page_images(layout, settings, target)
    assign_page_uv(target.data, layout)
    triangulate(target)
    length = max(target.dimensions)
    cage = build_cage(target, settings["cage_extrusion_ratio"] * length)
    bake_colour(source, target, cage, settings, length)
    paths = save_images(images, settings)
    print(RESULT_MARKER + json.dumps({"pages": paths}))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
