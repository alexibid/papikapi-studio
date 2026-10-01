from math import radians

import bmesh


def join_triangles_into_quads(surface, face_angle_deg, shape_angle_deg):
    bmesh.ops.join_triangles(
        surface,
        faces=surface.faces[:],
        angle_face_threshold=radians(face_angle_deg),
        angle_shape_threshold=radians(shape_angle_deg),
    )
