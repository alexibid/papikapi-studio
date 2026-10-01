import bmesh
import bpy
from mathutils import Matrix, Vector

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_single_mesh(glb_path):
    bpy.ops.import_scene.gltf(filepath=glb_path)
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {glb_path}")
    bpy.ops.object.select_all(action="DESELECT")
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return merged

def longest_side(mesh_builder):
    extents = []
    for axis in range(3):
        values = [vertex.co[axis] for vertex in mesh_builder.verts]
        extents.append(max(values) - min(values))
    return max(extents)

def weld_and_triangulate(mesh_builder, weld_distance):
    bmesh.ops.remove_doubles(mesh_builder, verts=mesh_builder.verts, dist=weld_distance)
    bmesh.ops.triangulate(mesh_builder, faces=mesh_builder.faces)
    mesh_builder.normal_update()

def seat_on_ground(mesh_builder, contact_height_ratio):
    lowest = min(vertex.co.z for vertex in mesh_builder.verts)
    height = max(vertex.co.z for vertex in mesh_builder.verts) - lowest
    contact = [v.co for v in mesh_builder.verts if v.co.z - lowest < contact_height_ratio * height]
    center_x = sum(point.x for point in contact) / len(contact)
    center_y = sum(point.y for point in contact) / len(contact)
    offset = Vector((-center_x, -center_y, -lowest))
    bmesh.ops.transform(mesh_builder, matrix=Matrix.Translation(offset), verts=mesh_builder.verts)
    mesh_builder.normal_update()
    return offset

def load_grounded_mesh(settings):
    clear_scene()
    imported = import_single_mesh(settings["input_glb"])
    mesh_builder = bmesh.new()
    mesh_builder.from_mesh(imported.data)
    length = longest_side(mesh_builder)
    weld_and_triangulate(mesh_builder, settings["weld_distance_ratio"] * length)
    offset = seat_on_ground(mesh_builder, settings["contact_height_ratio"])
    return mesh_builder, length, offset
