from math import radians

import bmesh
import numpy as np

COPLANAR_LIMIT = radians(0.5)
FACE_DIRECTIONS = [(axis, sign) for axis in range(3) for sign in (-1, 1)]


def exposed(occupied, cell, axis, sign):
    neighbour = list(cell)
    neighbour[axis] += sign
    inside = 0 <= neighbour[axis] < occupied.shape[axis]
    return not (inside and occupied[tuple(neighbour)])


def face_corners(cell, axis, sign):
    first, second = [a for a in range(3) if a != axis]
    level = cell[axis] + (1 if sign > 0 else 0)
    corners = []
    for step_first, step_second in ((0, 0), (1, 0), (1, 1), (0, 1)):
        index = [0, 0, 0]
        index[axis], index[first], index[second] = level, cell[first] + step_first, cell[second] + step_second
        corners.append(tuple(index))
    return corners


def build_cell_surface(occupied, planes):
    surface = bmesh.new()
    vertices = {}
    def vertex_at(index):
        if index not in vertices:
            vertices[index] = surface.verts.new([planes[axis][index[axis]] for axis in range(3)])
        return vertices[index]
    for cell in map(tuple, np.argwhere(occupied)):
        for axis, sign in FACE_DIRECTIONS:
            if exposed(occupied, cell, axis, sign):
                surface.faces.new([vertex_at(index) for index in face_corners(cell, axis, sign)])
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    return surface


def merge_coplanar_faces(surface):
    bmesh.ops.dissolve_limit(
        surface,
        angle_limit=COPLANAR_LIMIT,
        verts=surface.verts,
        edges=surface.edges,
        use_dissolve_boundaries=False,
    )
    surface.normal_update()


def triangulate_polygons(surface):
    polygons = [face for face in surface.faces if len(face.verts) > 4]
    bmesh.ops.triangulate(surface, faces=polygons)
    surface.normal_update()
