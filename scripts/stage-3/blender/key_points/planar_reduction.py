from math import radians

import bmesh
import bpy

from face_splitter import split_oversized_faces
from quad_conversion import join_triangles_into_quads
from surface_decimator import decimate_surface

WORKING_NAME = "PlanarRemesh"


def remesh_voxel(surface, voxel_size):
    mesh = bpy.data.meshes.new(WORKING_NAME)
    surface.to_mesh(mesh)
    item = bpy.data.objects.new(WORKING_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    modifier = item.modifiers.new(WORKING_NAME, "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel_size
    modifier.adaptivity = 0.0
    remeshed = item.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    surface.clear()
    surface.from_mesh(remeshed)
    bpy.data.objects.remove(item, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.triangulate(surface, faces=surface.faces)
    surface.normal_update()


def smooth_surface(surface, iterations, factor):
    for _ in range(iterations):
        bmesh.ops.smooth_vert(surface, verts=surface.verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    surface.normal_update()


def dissolve_planar(surface, angle_deg):
    bmesh.ops.dissolve_limit(
        surface,
        angle_limit=radians(angle_deg),
        verts=surface.verts,
        edges=surface.edges,
        use_dissolve_boundaries=False,
    )
    surface.normal_update()


def triangulate_polygons(surface):
    polygons = [face for face in surface.faces if len(face.verts) > 4]
    bmesh.ops.triangulate(surface, faces=polygons)
    surface.normal_update()


def reduce_planar(surface, length, settings):
    remesh_voxel(surface, length * settings["planar_voxel_ratio"])
    smooth_surface(surface, settings["planar_smooth_iterations"], settings["planar_smooth_factor"])
    decimate_surface(surface, settings["planar_decimate_faces"])
    dissolve_planar(surface, settings["planar_dissolve_angle_deg"])
    triangulate_polygons(surface)
    join_triangles_into_quads(surface, settings["quad_face_angle_deg"], settings["quad_shape_angle_deg"])
    split_oversized_faces(surface, length, settings["face_max_extent_ratio"])
    return surface
