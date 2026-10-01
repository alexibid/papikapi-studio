from math import atan2, cos, sin

from mathutils import Vector
from mathutils.geometry import convex_hull_2d

SHRINK = 0.997
EPSILON = 1e-9


def face_coordinates(face):
    origin = face.verts[0].co
    axis = (face.verts[1].co - origin).normalized()
    across = face.normal.cross(axis)
    return {vertex: Vector(((vertex.co - origin).dot(axis), (vertex.co - origin).dot(across))) for vertex in face.verts}


def alignment(source_start, source_end, target_start, target_end):
    turn = atan2(*reversed(target_end - target_start)) - atan2(*reversed(source_end - source_start))
    cosine, sine = cos(turn), sin(turn)

    def apply(point):
        local = point - source_start
        return target_start + Vector((local.x * cosine - local.y * sine, local.x * sine + local.y * cosine))

    return apply


def shrunk(polygon):
    centre = sum(polygon, Vector((0, 0))) / len(polygon)
    return [centre + (point - centre) * SHRINK for point in polygon]


def projections(polygon, axis):
    values = [point.dot(axis) for point in polygon]
    return min(values), max(values)


def convex_overlap(first, second):
    for polygon in (first, second):
        for index, point in enumerate(polygon):
            edge = polygon[(index + 1) % len(polygon)] - point
            axis = Vector((-edge.y, edge.x))
            if axis.length < EPSILON:
                continue
            low_a, high_a = projections(first, axis)
            low_b, high_b = projections(second, axis)
            if high_a <= low_b + EPSILON or high_b <= low_a + EPSILON:
                return False
    return True


def bounds(polygon):
    return (
        min(point.x for point in polygon),
        min(point.y for point in polygon),
        max(point.x for point in polygon),
        max(point.y for point in polygon),
    )


def boxes_touch(first, second):
    return not (first[2] < second[0] or second[2] < first[0] or first[3] < second[1] or second[3] < first[1])


def polygons_overlap(group, others):
    boxed = [(bounds(polygon), shrunk(polygon)) for polygon in others]
    for polygon in group:
        box, inner = bounds(polygon), shrunk(polygon)
        if any(boxes_touch(box, other_box) and convex_overlap(inner, other) for other_box, other in boxed):
            return True
    return False


def hull_area(cloud):
    points = [cloud[index] for index in convex_hull_2d(cloud)]
    doubled = sum(point.x * points[(index + 1) % len(points)].y - points[(index + 1) % len(points)].x * point.y for index, point in enumerate(points))
    return abs(doubled) / 2


def fits_page(cloud, width, height):
    points = [cloud[index] for index in convex_hull_2d(cloud)]
    for index, point in enumerate(points):
        edge = points[(index + 1) % len(points)] - point
        if edge.length < EPSILON:
            continue
        axis = edge.normalized()
        normal = Vector((-axis.y, axis.x))
        span = projections(points, axis)
        depth = projections(points, normal)
        size = sorted((span[1] - span[0], depth[1] - depth[0]))
        if size[0] <= min(width, height) and size[1] <= max(width, height):
            return True
    return False
