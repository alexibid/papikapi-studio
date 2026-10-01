from math import cos, pi, sin, sqrt

from mathutils import Vector
from mathutils.bvhtree import BVHTree

CANDIDATES = 64
LOWEST_VIEW_Z = -0.35
PREFERRED_VIEW_Z = 0.35
HEIGHT_PREFERENCE = 0.15
SURFACE_OFFSET = 1e-4


def sphere_directions(count):
    golden = pi * (3 - sqrt(5))
    for index in range(count):
        z = 1 - 2 * (index + 0.5) / count
        radius = sqrt(1 - z * z)
        yield Vector((cos(golden * index) * radius, sin(golden * index) * radius, z))


class ViewChooser:
    def __init__(self, source, visible_face_ids):
        world = source.matrix_world
        mesh = source.data
        self.world = world
        self.mesh = mesh
        ids = sorted(visible_face_ids)
        self.vertices = [world @ vertex.co for vertex in mesh.vertices]
        self.tree = BVHTree.FromPolygons(self.vertices, [list(mesh.polygons[face_id].vertices) for face_id in ids])

    def face_normal(self, face_id):
        return (self.world.to_3x3() @ self.mesh.polygons[face_id].normal).normalized()

    def face_centre(self, face_id):
        polygon = self.mesh.polygons[face_id]
        return sum((self.vertices[index] for index in polygon.vertices), Vector()) / len(polygon.vertices)

    def unoccluded(self, point, normal, direction):
        return self.tree.ray_cast(point + normal * SURFACE_OFFSET, direction)[0] is None

    def score(self, face_ids, direction):
        total = 0.0
        for face_id in face_ids:
            normal = self.face_normal(face_id)
            facing = normal.dot(direction)
            if facing > 0 and self.unoccluded(self.face_centre(face_id), normal, direction):
                total += self.mesh.polygons[face_id].area * facing
        return total * (1 + HEIGHT_PREFERENCE * (1 - abs(direction.z - PREFERRED_VIEW_Z)))

    def best(self, face_ids):
        candidates = [direction for direction in sphere_directions(CANDIDATES) if direction.z >= LOWEST_VIEW_Z]
        return max(candidates, key=lambda direction: self.score(face_ids, direction))

    def edge_visible(self, edge_index, face_id, direction):
        edge = self.mesh.edges[edge_index]
        midpoint = (self.vertices[edge.vertices[0]] + self.vertices[edge.vertices[1]]) / 2
        normal = self.face_normal(face_id)
        return normal.dot(direction) > 0 and self.unoccluded(midpoint, normal, direction)
