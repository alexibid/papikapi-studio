"""The outer surface of a TRELLIS mesh still has small holes and non-manifold edges that edge repair cannot
close, and decimating an open surface flips normals and breaks the volume. A fine voxel remesh rebuilds the same
shape as one closed manifold solid; the texture is baked back from the original afterwards, so losing the
original UVs here costs nothing. Small floating pieces the voxels create are dropped."""
import bmesh
import bpy

WORKING_NAME = "Watertight"
MIN_SHELL_SHARE = 0.005


def shells(surface):
    remaining, found = set(surface.faces), []
    while remaining:
        start = remaining.pop()
        stack, members = [start], [start]
        while stack:
            for edge in stack.pop().edges:
                for neighbour in edge.link_faces:
                    if neighbour in remaining:
                        remaining.remove(neighbour)
                        stack.append(neighbour)
                        members.append(neighbour)
        found.append(members)
    return found


def signed_volume(faces):
    return sum(face.calc_area() * face.calc_center_median().dot(face.normal) for face in faces) / 3


def drop_small_shells(surface):
    measured = [(signed_volume(members), members) for members in shells(surface)]
    largest = max(volume for volume, _ in measured)
    small = [face for volume, members in measured if volume < MIN_SHELL_SHARE * largest for face in members]
    if small:
        bmesh.ops.delete(surface, geom=small, context="FACES")


def watertight_copy(surface, voxel_size):
    mesh = bpy.data.meshes.new(WORKING_NAME)
    surface.to_mesh(mesh)
    item = bpy.data.objects.new(WORKING_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    modifier = item.modifiers.new(WORKING_NAME, "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel_size
    modifier.adaptivity = 0.0
    closed = bmesh.new()
    closed.from_mesh(item.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh())
    bpy.data.objects.remove(item, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.triangulate(closed, faces=closed.faces)
    bmesh.ops.recalc_face_normals(closed, faces=closed.faces)
    drop_small_shells(closed)
    closed.normal_update()
    return closed
