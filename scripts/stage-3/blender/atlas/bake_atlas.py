"""s3-step-1 (texture): transfers the colour of the detailed stage-2 figure onto the simplified one, by closest
point ("nearest", default) or by a Cycles ray bake along the face normals ("rays").

blender -b -P bake_atlas.py -- '{"detailed_glb", "simple_glb", "ground_offset", "output_png", "output_uv_json",
"output_glb", ...}'
The simplified mesh gets fresh UVs (one island per group of flat faces) and a new atlas; its geometry is untouched.
"""
import json
import sys
import traceback
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from nearest_transfer import transfer as nearest_transfer

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
ATLAS_NAME = "Atlas"


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def import_joined(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [item for item in bpy.data.objects if item not in before and item.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined.name = name
    return joined


def base_colour_only(figure):
    """The diffuse-colour bake darkens metallic texels; only the base colour is wanted, so metallic is cut."""
    for material in figure.data.materials:
        principled = material.node_tree.nodes.get("Principled BSDF")
        if principled is None:
            continue
        for link in list(principled.inputs["Metallic"].links):
            material.node_tree.links.remove(link)
        principled.inputs["Metallic"].default_value = 0.0


def unwrap(figure, settings):
    bpy.ops.object.select_all(action="DESELECT")
    figure.select_set(True)
    bpy.context.view_layer.objects.active = figure
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=settings["uv_angle_limit_rad"], island_margin=settings["uv_island_margin"])
    bpy.ops.object.mode_set(mode="OBJECT")


def atlas_material(figure, resolution):
    image = bpy.data.images.new(ATLAS_NAME, resolution, resolution, alpha=True)
    image.generated_color = (0.0, 0.0, 0.0, 0.0)
    material = bpy.data.materials.new(ATLAS_NAME)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    nodes.active = texture
    figure.data.materials.clear()
    figure.data.materials.append(material)
    return image


def bake(detailed, simple, extrusion, settings):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    bake_settings = scene.render.bake
    bake_settings.use_selected_to_active = True
    bake_settings.cage_extrusion = extrusion
    bake_settings.max_ray_distance = 2 * extrusion
    bake_settings.margin = settings["bake_margin_px"]
    bpy.ops.object.select_all(action="DESELECT")
    detailed.select_set(True)
    simple.select_set(True)
    bpy.context.view_layer.objects.active = simple
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})


def write_islands(figure, path):
    """UV polygon of every face, so the atlas cleanup knows which texels belong to which face."""
    uv_layer = figure.data.uv_layers.active.data
    faces = [[list(uv_layer[loop].uv) for loop in polygon.loop_indices] for polygon in figure.data.polygons]
    with open(path, "w") as output:
        json.dump({"faces": faces}, output)


def base_colour_image(figure):
    for material in figure.data.materials:
        principled = material.node_tree.nodes.get("Principled BSDF")
        links = principled.inputs["Base Color"].links if principled else []
        if links and links[0].from_node.type == "TEX_IMAGE":
            return links[0].from_node.image
    raise RuntimeError("The detailed figure has no base colour texture")


def fill_atlas(detailed, simple, image, settings):
    """Closest-point transfer (default) or a Cycles ray bake along the face normals."""
    if settings["transfer"] == "nearest":
        nearest_transfer(detailed.data, base_colour_image(detailed), simple.data, image)
        return
    length = max(simple.dimensions)
    bake(detailed, simple, length * settings["cage_extrusion_ratio"], settings)


def save(image, path):
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()


def export(simple, path):
    bpy.ops.object.select_all(action="DESELECT")
    simple.select_set(True)
    bpy.context.view_layer.objects.active = simple
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_materials="EXPORT")


def main():
    settings = read_settings()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    detailed = import_joined(settings["detailed_glb"], "Detailed")
    base_colour_only(detailed)
    detailed.location = settings["ground_offset"]
    bpy.ops.object.select_all(action="DESELECT")
    detailed.select_set(True)
    bpy.context.view_layer.objects.active = detailed
    bpy.ops.object.transform_apply(location=True)
    simple = import_joined(settings["simple_glb"], "Simplified")
    for polygon in simple.data.polygons:
        polygon.use_smooth = False
    unwrap(simple, settings)
    write_islands(simple, settings["output_uv_json"])
    image = atlas_material(simple, settings["resolution"])
    fill_atlas(detailed, simple, image, settings)
    save(image, settings["output_png"])
    bpy.data.objects.remove(detailed, do_unlink=True)
    if settings.get("output_glb"):
        export(simple, settings["output_glb"])
    print(RESULT_MARKER + json.dumps({"resolution": settings["resolution"], "faces": len(simple.data.polygons)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
