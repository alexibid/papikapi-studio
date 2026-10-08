"""Six clean orthographic views of a GLB, textures only (no lighting, no noise), on a transparent background."""
import json
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
FRAMING = 1.12
VIEWS = {
    "front": ((0, 1, 0), (0, 0, 1)),
    "back": ((0, -1, 0), (0, 0, 1)),
    "left": ((1, 0, 0), (0, 0, 1)),
    "right": ((-1, 0, 0), (0, 0, 1)),
    "top": ((0, 0, -1), (0, 1, 0)),
    "bottom": ((0, 0, 1), (0, -1, 0)),
}


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def configure_scene(resolution: int):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light, shading.color_type = "FLAT", "TEXTURE"
    scene.display.render_aa = "8"
    scene.view_settings.view_transform = "Standard"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    return scene


def bounds() -> tuple[Vector, float]:
    corners = [item.matrix_world @ Vector(corner) for item in bpy.context.scene.objects if item.type == "MESH" for corner in item.bound_box]
    low = Vector(min(point[axis] for point in corners) for axis in range(3))
    high = Vector(max(point[axis] for point in corners) for axis in range(3))
    return (low + high) / 2.0, max(high - low)


def place_camera(camera, direction: Vector, up: Vector, centre: Vector, extent: float) -> None:
    right = up.cross(-direction).normalized()
    camera.data.ortho_scale = extent * FRAMING
    camera.matrix_world = Matrix.Translation(centre - direction * extent * 3.0) @ Matrix((right, up, -direction)).transposed().to_4x4()


def render_views(settings: dict) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=settings["glb"])
    scene = configure_scene(int(settings["resolution"]))
    data = bpy.data.cameras.new("Camera")
    data.type, data.clip_end = "ORTHO", 1000.0
    camera = bpy.data.objects.new("Camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    centre, extent = bounds()
    output = Path(settings["output_dir"])
    output.mkdir(parents=True, exist_ok=True)
    for name, (direction, up) in VIEWS.items():
        place_camera(camera, Vector(direction), Vector(up), centre, extent)
        scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)
    return {"views": len(VIEWS)}


if __name__ == "__main__":
    try:
        print(RESULT_MARKER + json.dumps(render_views(read_settings())))
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
