import bmesh
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


def measure_quality(surface, reference):
    tree = BVHTree.FromBMesh(reference)
    deviations = [tree.find_nearest(vertex.co)[3] for vertex in surface.verts]
    reference_volume = enclosed_volume(reference)
    open_edges, non_manifold = open_and_non_manifold_edges(surface)
    return {
        "meshFaces": len(surface.faces),
        "quads": sum(1 for face in surface.faces if len(face.verts) == 4),
        "openEdges": open_edges,
        "nonManifoldEdges": non_manifold,
        "airtight": open_edges == 0 and non_manifold == 0,
        "volumeChangePercent": round(100 * (enclosed_volume(surface) - reference_volume) / reference_volume, 2),
        "maxDeviationMm": round(1000 * max(deviations), 2),
        "featureLossMm": round(1000 * lost_feature_distance(surface, reference), 2),
    }
