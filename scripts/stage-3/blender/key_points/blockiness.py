from math import atan2, cos, sin

ALIGNED_NORMAL = 0.97


def rotate_horizontal(normal, angle):
    return normal.x * cos(angle) - normal.y * sin(angle), normal.x * sin(angle) + normal.y * cos(angle), normal.z


def is_axis_aligned(normal, yaw):
    components = rotate_horizontal(normal, -yaw)
    return max(abs(value) for value in components) >= ALIGNED_NORMAL


def aligned_area_ratio(surface, yaw):
    surface.normal_update()
    total = sum(face.calc_area() for face in surface.faces)
    aligned = sum(face.calc_area() for face in surface.faces if is_axis_aligned(face.normal, yaw))
    return aligned / total if total else 0.0
