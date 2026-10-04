import json
import os
import sys
import traceback
import bpy
from mathutils import Matrix, Vector

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "

VIEWS = {
    "front": (Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    "back": (Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))),
    "right": (Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    "left": (Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))),
    "top": (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
    "bottom": (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, -1, 0))),
}


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def configure_cycles(scene, resolution: int):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.cycles.filter_width = 0.01
    scene.render.film_transparent = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def setup_world(scene):
    world = bpy.data.worlds.new("PaperWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs["Strength"].default_value = 0.4


def setup_materials():
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Roughness"].default_value = 0.8
                    node.inputs["Metallic"].default_value = 0.0
                    if "Specular IOR Level" in node.inputs:
                        node.inputs["Specular IOR Level"].default_value = 0.0
                    elif "Specular" in node.inputs:
                        node.inputs["Specular"].default_value = 0.0


def render_views(input_glb: str, output_dir: str, resolution: int = 2048, margin: float = 0.0):
    os.makedirs(output_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_cycles(scene, resolution)
    setup_world(scene)

    bpy.ops.import_scene.gltf(filepath=input_glb)
    setup_materials()

    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("No mesh objects found in imported glTF")

    corners = [obj.matrix_world @ Vector(coord) for obj in meshes for coord in obj.bound_box]
    low = Vector(min(coord[i] for coord in corners) for i in range(3))
    high = Vector(max(coord[i] for coord in corners) for i in range(3))
    centre = (low + high) / 2.0
    distance = (high - low).length * 2.0

    cam_data = bpy.data.cameras.new("OrthoCamera")
    cam_data.type = "ORTHO"
    cam_data.clip_start = 0.001
    cam_data.clip_end = distance * 4.0
    cam_obj = bpy.data.objects.new("OrthoCamera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    light_data = bpy.data.lights.new("CameraLight", type="SUN")
    light_data.energy = 2.0
    light_obj = bpy.data.objects.new("CameraLight", light_data)
    scene.collection.objects.link(light_obj)

    cameras_meta = {}
    for name, (direction, right, up) in VIEWS.items():
        extent_u = abs(right.dot(high - low))
        extent_v = abs(up.dot(high - low))
        cam_data.ortho_scale = max(extent_u, extent_v) * (1.0 + margin)
        rotation = Matrix((right, up, -direction)).transposed()
        cam_obj.matrix_world = Matrix.Translation(centre - direction * distance) @ rotation.to_4x4()
        light_obj.matrix_world = cam_obj.matrix_world.copy()

        output_file = f"{name}.png"
        scene.render.filepath = os.path.join(output_dir, output_file)
        bpy.ops.render.render(write_still=True)

        cameras_meta[name] = {
            "file": output_file,
            "direction": [float(c) for c in direction],
            "right": [float(c) for c in right],
            "up": [float(c) for c in up],
            "orthoScale": float(cam_data.ortho_scale),
        }

    document = {
        "resolution": resolution,
        "boundsMin": [float(c) for c in low],
        "boundsMax": [float(c) for c in high],
        "centre": [float(c) for c in centre],
        "views": cameras_meta,
    }
    with open(os.path.join(output_dir, "views.json"), "w") as handle:
        json.dump(document, handle, indent=2)

    return {
        "viewsCount": len(cameras_meta),
        "resolution": resolution,
        "boundsMin": document["boundsMin"],
        "boundsMax": document["boundsMax"],
        "centre": document["centre"],
    }


def main():
    settings = read_settings()
    stats = render_views(
        input_glb=settings["input_glb"],
        output_dir=settings["output_dir"],
        resolution=settings.get("resolution", 2048),
        margin=settings.get("margin", 0.0),
    )
    print(RESULT_MARKER + json.dumps(stats))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
