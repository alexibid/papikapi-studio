import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy
from view_camera import create_ortho_camera, world_bounds
from view_renderer import (
    configure_cycles,
    make_flat_emission,
    render_all_views,
    write_views_document,
)

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def import_model_meshes(path: str):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {path}")
    return meshes


def execute_render_views(settings: dict) -> dict:
    input_glb = settings["input_glb"]
    output_dir = settings["output_dir"]
    resolution = int(settings.get("resolution", 2048))
    margin = float(settings.get("margin", 0.0))

    window = bpy.context.window
    original_scene = window.scene if window else None
    bpy.ops.scene.new(type="EMPTY")
    scene = bpy.context.scene

    try:
        meshes = import_model_meshes(input_glb)
        for mesh in meshes:
            for slot in mesh.material_slots:
                if slot.material:
                    make_flat_emission(slot.material)

        low, high = world_bounds(meshes)
        configure_cycles(scene, resolution)
        camera = create_ortho_camera(scene)

        cameras = render_all_views(scene, camera, low, high, output_dir, margin)
        doc = write_views_document(output_dir, cameras, low, high, resolution)

        return {
            "viewsCount": len(cameras),
            "resolution": resolution,
            "boundsMin": doc["boundsMin"],
            "boundsMax": doc["boundsMax"],
            "centre": doc["centre"],
        }
    finally:
        if original_scene:
            window.scene = original_scene
            bpy.data.scenes.remove(scene)


def main():
    settings = read_settings()
    result = execute_render_views(settings)
    print(RESULT_MARKER + json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
