import bpy

from facet_colours import paint_polygons

GRAY = (0.75, 0.75, 0.75, 1.0)
SIMPLIFIED_MESH_NAME = "Airtight_Mesh"


def remove_everything():
    for item in list(bpy.data.objects):
        bpy.data.objects.remove(item, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for block in list(collection):
            collection.remove(block)


def colored_material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    return material


def add_simplified_mesh(surface, colours):
    mesh = bpy.data.meshes.new(SIMPLIFIED_MESH_NAME)
    surface.to_mesh(mesh)
    if colours:
        paint_polygons(mesh, colours)
    mesh.materials.append(colored_material(SIMPLIFIED_MESH_NAME, GRAY))
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    item = bpy.data.objects.new(SIMPLIFIED_MESH_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    item.show_wire = True
    return item


def build_scene(surface, colours):
    remove_everything()
    add_simplified_mesh(surface, colours)
