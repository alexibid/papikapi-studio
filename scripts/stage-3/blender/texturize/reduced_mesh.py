import json

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SMART_PROJECT_ANGLE = 66.0 / 180.0 * 3.141592653589793
ISLAND_MARGIN = 0.01


def build_reduced_object(reduce_json: str):
    """The reduced mesh, in the same frame as the optimized model."""
    with open(reduce_json) as handle:
        document = json.load(handle)
    offset = Vector(document.get("groundOffset", (0, 0, 0)))
    surface = bmesh.new()
    vertices = [surface.verts.new(Vector(v["position"]) - offset) for v in document["vertices"]]
    for face in document["faces"]:
        corners = [vertices[i] for i in face]
        if surface.faces.get(corners) is None:
            surface.faces.new(corners)
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    mesh = bpy.data.meshes.new("Reduce")
    surface.to_mesh(mesh)
    surface.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    reduced = bpy.data.objects.new("Reduce", mesh)
    bpy.context.scene.collection.objects.link(reduced)
    return reduced


def unwrap(reduced) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    reduced.select_set(True)
    bpy.context.view_layer.objects.active = reduced
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=SMART_PROJECT_ANGLE, island_margin=ISLAND_MARGIN)
    bpy.ops.object.mode_set(mode="OBJECT")


def texels_of(reduced, resolution: int):
    """Row, column and 3D position of every texel covered by the unwrapped reduced mesh."""
    mesh = reduced.data
    uv_layer = mesh.uv_layers.active.data
    mesh.calc_loop_triangles()
    rows, columns, points = [], [], []
    for triangle in mesh.loop_triangles:
        corners = np.array([uv_layer[loop].uv[:] for loop in triangle.loops]) * resolution
        positions = np.array([mesh.vertices[i].co[:] for i in triangle.vertices])
        low = np.maximum(np.floor(corners.min(axis=0)).astype(int), 0)
        high = np.minimum(np.ceil(corners.max(axis=0)).astype(int), resolution - 1)
        grid_x, grid_y = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
        centres = np.stack([grid_x.ravel() + 0.5, grid_y.ravel() + 0.5], axis=1)
        edge1, edge2, offset = corners[1] - corners[0], corners[2] - corners[0], centres - corners[0]
        area = edge1[0] * edge2[1] - edge1[1] * edge2[0]
        if abs(area) < 1e-12:
            continue
        weight1 = (offset[:, 0] * edge2[1] - offset[:, 1] * edge2[0]) / area
        weight2 = (edge1[0] * offset[:, 1] - edge1[1] * offset[:, 0]) / area
        inside = (weight1 >= -1e-6) & (weight2 >= -1e-6) & (weight1 + weight2 <= 1 + 1e-6)
        weights = np.stack([1 - weight1 - weight2, weight1, weight2], axis=1)[inside]
        columns.append(grid_x.ravel()[inside])
        rows.append(grid_y.ravel()[inside])
        points.append(weights @ positions)
    return np.concatenate(rows), np.concatenate(columns), np.concatenate(points)
