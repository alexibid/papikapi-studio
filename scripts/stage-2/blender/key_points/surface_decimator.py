import bpy

WORKING_NAME = "Decimating"


def decimate_surface(surface, target_faces):
    mesh = bpy.data.meshes.new(WORKING_NAME)
    surface.to_mesh(mesh)
    item = bpy.data.objects.new(WORKING_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    modifier = item.modifiers.new(WORKING_NAME, "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = min(1.0, target_faces / len(mesh.polygons))
    modifier.use_collapse_triangulate = True
    reduced = item.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    surface.clear()
    surface.from_mesh(reduced)
    surface.normal_update()
    bpy.data.objects.remove(item, do_unlink=True)
    bpy.data.meshes.remove(mesh)
