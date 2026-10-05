from math import atan2, cos, sin

from mathutils import Matrix

SIDE_FACING_LIMIT = 0.5


def estimate_yaw(surface):
    surface.normal_update()
    cosine_sum = sine_sum = 0.0
    for face in surface.faces:
        if abs(face.normal.z) >= SIDE_FACING_LIMIT:
            continue
        heading = atan2(face.normal.y, face.normal.x)
        cosine_sum += face.calc_area() * cos(4 * heading)
        sine_sum += face.calc_area() * sin(4 * heading)
    return atan2(sine_sum, cosine_sum) / 4


def rotate_about_vertical(surface, angle):
    rotation = Matrix.Rotation(angle, 3, "Z")
    for vertex in surface.verts:
        vertex.co = rotation @ vertex.co
    surface.normal_update()
