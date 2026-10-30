import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def open_and_non_manifold_edges(surface):
    open_edges = sum(1 for edge in surface.edges if edge.is_boundary)
    non_manifold = sum(1 for edge in surface.edges if not edge.is_manifold and not edge.is_boundary)
    return open_edges, non_manifold


def enclosed_volume(mesh_builder):
    return abs(sum(face.calc_area() * face.calc_center_median().dot(face.normal) for face in mesh_builder.faces)) / 3


def lost_feature_distance(surface, reference):
    triangulated = surface.copy()
    bmesh.ops.triangulate(triangulated, faces=triangulated.faces)
    tree = BVHTree.FromBMesh(triangulated)
    samples = [vertex.co for vertex in reference.verts] + [face.calc_center_median() for face in reference.faces]
    farthest = max(tree.find_nearest(point)[3] for point in samples)
    triangulated.free()
    return farthest


PARITY_DIRECTIONS = (Vector((0.0, 0.0, 1.0)), Vector((1.0, 0.0, 0.0)), Vector((0.0, -1.0, 0.0)))
PARITY_STEP = 1e-6
PARITY_MAX_HITS = 64


def crossings(tree, point, direction):
    count, origin = 0, point
    while count < PARITY_MAX_HITS:
        location = tree.ray_cast(origin, direction)[0]
        if location is None:
            return count
        count, origin = count + 1, location + direction * PARITY_STEP
    return count


def inside(tree, point):
    """Odd crossings mean inside; three directions vote so a ray grazing an edge cannot decide alone."""
    return sum(crossings(tree, point, direction) % 2 for direction in PARITY_DIRECTIONS) >= 2


def outside_distance(closed, reference):
    """How far the reference sticks out of a closed solid: points inside it (faces buried where blocks overlap, the
    inner wall of a hollow mesh) are rightly dropped by closing and count as zero."""
    triangulated = closed.copy()
    bmesh.ops.triangulate(triangulated, faces=triangulated.faces)
    tree = BVHTree.FromBMesh(triangulated)
    samples = [vertex.co for vertex in reference.verts] + [face.calc_center_median() for face in reference.faces]
    farthest = 0.0
    for point in samples:
        distance = tree.find_nearest(point)[3]
        if distance > farthest and not inside(tree, point):
            farthest = distance
    triangulated.free()
    return farthest


def dimensions(surface):
    return [max(v.co[axis] for v in surface.verts) - min(v.co[axis] for v in surface.verts) for axis in range(3)]


def dimension_change_percent(surface, reference):
    return max(100.0 * abs(low - high) / high for low, high in zip(dimensions(surface), dimensions(reference)))


def measure_quality(surface, reference):
    tree = BVHTree.FromBMesh(reference)
    deviations = [tree.find_nearest(vertex.co)[3] for vertex in surface.verts]
    reference_volume = enclosed_volume(reference)
    open_edges, non_manifold = open_and_non_manifold_edges(surface)
    return {
        "dimensionChangePercent": round(dimension_change_percent(surface, reference), 2),
        "meshFaces": len(surface.faces),
        "quads": sum(1 for face in surface.faces if len(face.verts) == 4),
        "openEdges": open_edges,
        "nonManifoldEdges": non_manifold,
        "airtight": open_edges == 0 and non_manifold == 0,
        "volumeChangePercent": round(100 * (enclosed_volume(surface) - reference_volume) / reference_volume, 2),
        "maxDeviationMm": round(1000 * max(deviations), 2),
        "featureLossMm": round(1000 * lost_feature_distance(surface, reference), 2),
    }
