import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[3] / "common" / "blender"))

import bpy

from baking import (
    attach_image_material,
    bake_colour,
    build_cage,
    clear_scene,
    create_image,
    import_model,
    remove_metal,
    show_texture_as_colour,
    triangulate,
)
from art_projection import project_art
from source_alignment import align_source
from target_mesh import build_target
from uv_layout import layout_islands

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
BLACK = (0.0, 0.0, 0.0, 1.0)


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def read_document(path):
    return json.loads(Path(path).read_text())


def load_source(glb_path):
    clear_scene()
    source = import_model(glb_path)
    remove_metal(source)
    return source


def export_glb(target, settings):
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(
        filepath=settings["output_glb"],
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=settings["jpeg_quality"],
    )


def main():
    settings = read_settings()
    document = read_document(settings["input_mesh"])
    length = document["lengthMeters"]
    source = load_source(settings["input_glb"])
    target = build_target(document)
    align_source(source, [vertex.co.copy() for vertex in target.data.vertices])
    projection = project_art(source, settings["input_art"])
    density = layout_islands(target.data, settings["atlas_size_px"], settings["island_padding_px"])
    faces = len(target.data.polygons)
    triangulate(target)
    cage = build_cage(target, settings["cage_extrusion_ratio"] * length)
    image = create_image("Texture", settings["atlas_size_px"], settings["atlas_size_px"], BLACK)
    material = attach_image_material(target, "Papercraft", image)
    bake_colour(source, target, cage, settings, length)
    image.pack()
    show_texture_as_colour(material)
    bpy.data.objects.remove(cage, do_unlink=True)
    export_glb(target, settings)
    print(RESULT_MARKER + json.dumps({"faces": faces, "texelsPerMm": round(density / 1000, 3), **projection}))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
