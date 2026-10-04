import json
import os
import sys

import bpy
from mathutils import Matrix, Vector


def parse_args():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def configure_engine(scene, resolution):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def setup_lighting(scene):
    world = bpy.data.worlds.new("EvidenceWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.05, 0.05, 0.06, 1.0)
        bg.inputs["Strength"].default_value = 0.5
    scene.world = world

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 2.0
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (0.7, 0.2, 0.8)
    scene.collection.objects.link(sun)

    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 1.0
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.rotation_euler = (-0.5, -0.3, -2.0)
    scene.collection.objects.link(fill)


def import_model(filepath):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No meshes found in {filepath}")
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def setup_camera(scene, direction, right, up, centre, ortho_scale, distance):
    cam_data = bpy.data.cameras.new("RenderCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = 0.001
    cam_data.clip_end = distance * 4.0
    cam_obj = bpy.data.objects.new("RenderCam", cam_data)
    rotation = Matrix((right, up, -direction)).transposed()
    cam_obj.matrix_world = Matrix.Translation(centre - direction * distance) @ rotation.to_4x4()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    return cam_obj


def main():
    settings = parse_args()
    model_path = settings["model_path"]
    output_path = settings["output_path"]
    resolution = settings["resolution"]
    ortho_scale = settings["ortho_scale"]
    centre = Vector(settings["centre"])
    direction = Vector(settings["direction"])
    right = Vector(settings["right"])
    up = Vector(settings["up"])
    distance = settings["distance"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_engine(scene, resolution)
    setup_lighting(scene)
    import_model(model_path)
    setup_camera(scene, direction, right, up, centre, ortho_scale, distance)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    print("RENDER_PANEL_OK " + output_path)


if __name__ == "__main__":
    main()
