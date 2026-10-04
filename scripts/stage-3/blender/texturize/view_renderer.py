import json
import os
import bpy
from view_camera import VIEWS, configure_view_camera


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


def make_flat_emission(material):
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    texture = next((n for n in nodes if n.type == "TEX_IMAGE"), None)
    emission = nodes.new("ShaderNodeEmission")
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    if texture:
        links.new(texture.outputs["Color"], emission.inputs["Color"])
    else:
        principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        emission.inputs["Color"].default_value = principled.inputs["Base Color"].default_value if principled else (0.8, 0.8, 0.8, 1)
    links.new(emission.outputs["Emission"], output.inputs["Surface"])


def render_all_views(scene, camera, low, high, output_dir: str, margin: float = 0.0) -> dict:
    os.makedirs(output_dir, exist_ok=True)
    cameras_meta = {}
    for name in VIEWS:
        configure_view_camera(camera, name, low, high, margin)
        output_file = f"{name}.png"
        scene.render.filepath = os.path.join(output_dir, output_file)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        direction, right, up = VIEWS[name]
        cameras_meta[name] = {
            "file": output_file,
            "direction": list(direction),
            "right": list(right),
            "up": list(up),
            "orthoScale": float(camera.data.ortho_scale),
        }
    return cameras_meta


def write_views_document(output_dir: str, cameras: dict, low, high, resolution: int):
    document = {
        "resolution": resolution,
        "boundsMin": [float(c) for c in low],
        "boundsMax": [float(c) for c in high],
        "centre": [float((low[i] + high[i]) / 2.0) for i in range(3)],
        "views": cameras,
    }
    with open(os.path.join(output_dir, "views.json"), "w") as handle:
        json.dump(document, handle, indent=2)
    return document
