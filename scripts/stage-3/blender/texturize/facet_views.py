import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "python" / "vectorize"))

import bpy
import numpy as np
from facet_colors import facet_colours
from mathutils import Matrix, Vector
from view_camera import VIEWS, create_ortho_camera
from view_renderer import configure_cycles

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def to_linear(colour):
    c = np.asarray(colour, dtype=np.float64)
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def build_coloured_object(surface, colours):
    mesh = bpy.data.meshes.new("Facets")
    surface.to_mesh(mesh)
    attribute = mesh.color_attributes.new("facet", "FLOAT_COLOR", "CORNER")
    for polygon in mesh.polygons:
        polygon.use_smooth = False
        colour = to_linear(colours[polygon.index])
        for loop in polygon.loop_indices:
            attribute.data[loop].color = (*colour, 1.0)
    material = bpy.data.materials.new("FacetColour")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    source = nodes.new("ShaderNodeAttribute")
    source.attribute_name = "facet"
    emission = nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(source.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mesh.materials.append(material)
    item = bpy.data.objects.new("Facets", mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def place_camera(camera, name, views_data):
    direction, right, up = VIEWS[name]
    view = views_data["views"][name]
    centre = Vector(views_data["centre"])
    camera.data.ortho_scale = float(view["orthoScale"])
    distance = (Vector(views_data["boundsMax"]) - Vector(views_data["boundsMin"])).length * 2.0
    rotation = Matrix((right, up, -direction)).transposed()
    camera.matrix_world = Matrix.Translation(centre - direction * distance) @ rotation.to_4x4()


def execute_facet_views(settings: dict) -> dict:
    views_dir, output_dir = settings["views_dir"], settings["output_dir"]
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(views_dir, "views.json")) as handle:
        views_data = json.load(handle)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    surface, colours = facet_colours(settings["base_glb"], settings["reduce_json"])
    scene = bpy.context.scene
    build_coloured_object(surface, colours)
    surface.free()
    configure_cycles(scene, int(views_data["resolution"]))
    camera = create_ortho_camera(scene)
    for name in VIEWS:
        place_camera(camera, name, views_data)
        scene.render.filepath = os.path.join(output_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True, scene=scene.name)
    return {"faces": len(colours), "viewsCount": len(VIEWS)}


def main():
    print(RESULT_MARKER + json.dumps(execute_facet_views(read_settings())))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
