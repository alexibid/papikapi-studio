import bpy

AIRTIGHT_MESH_NAME = "Airtight_Mesh"


def export_airtight_mesh_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    item = bpy.data.objects[AIRTIGHT_MESH_NAME]
    item.select_set(True)
    bpy.context.view_layer.objects.active = item
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="NONE",
    )
