import bmesh
import bpy

from baking import link_object

TARGET_NAME = "Papercraft"


def outward_oriented_mesh(document):
    mesh = bpy.data.meshes.new(TARGET_NAME)
    mesh.from_pydata([vertex["position"] for vertex in document["vertices"]], [], document["faces"])
    mesh.update()
    builder = bmesh.new()
    builder.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(builder, faces=builder.faces)
    builder.to_mesh(mesh)
    builder.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return mesh


def build_target(document):
    return link_object(TARGET_NAME, outward_oriented_mesh(document))
