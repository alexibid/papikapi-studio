from math import cos, radians

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from mesh_quality import open_and_non_manifold_edges


def fold_limit(length, settings):
    return settings["min_fold_length_mm"] / settings["target_size_mm"] * length


def face_width(face):
    longest = max(edge.calc_length() for edge in face.edges)
    return 2 * face.calc_area() / longest if longest > 0 else 0.0


def narrow_faces(surface, limit):
    return sorted((face for face in surface.faces if face_width(face) < limit), key=face_width)


def face_signature(face):
    return tuple(round(c, 5) for c in face.calc_center_median())


def collapse_targets(edge):
    first, second = edge.verts
    return [first.co.copy(), second.co.copy(), (first.co + second.co) / 2]


def stays_on_surface(vertex, tree, tolerance):
    if not vertex.is_valid or not vertex.link_faces:
        return False
    if tree.find_nearest(vertex.co)[3] > tolerance:
        return False
    return all(tree.find_nearest(face.calc_center_median())[1].dot(face.normal) > 0 for face in vertex.link_faces)


class ReferenceProbe:
    def __init__(self, reference, surface, tolerance):
        self.tree = BVHTree.FromBMesh(reference)
        self.tolerance = tolerance
        self.coordinates = [vertex.co.copy() for vertex in reference.verts]
        self.coordinates += [face.calc_center_median() for face in reference.faces]
        self.allowances = [distance_to(surface, point) + tolerance for point in self.coordinates]


def distance_to(surface, point):
    return BVHTree.FromBMesh(surface).find_nearest(point)[3]


def keeps_reference_covered(trial, probe):
    local = BVHTree.FromBMesh(trial)
    nearest = (local.find_nearest(point) for point in probe.coordinates)
    return all(hit is not None and hit[3] <= allowance for hit, allowance in zip(nearest, probe.allowances))


def volume_gradient(trial, vertex):
    origin = vertex.co.copy()
    base = signed_volume(trial)
    gradient = Vector((0, 0, 0))
    for axis in range(3):
        vertex.co = origin + Vector(tuple(1e-4 if index == axis else 0 for index in range(3)))
        gradient[axis] = (signed_volume(trial) - base) / 1e-4
    vertex.co = origin
    return gradient


def signed_volume(mesh_builder):
    mesh_builder.normal_update()
    return sum(face.calc_area() * face.calc_center_median().dot(face.normal) for face in mesh_builder.faces) / 3


def restore_volume(trial, vertex, volume_before):
    gradient = volume_gradient(trial, vertex)
    if gradient.length_squared > 0:
        vertex.co = vertex.co + gradient * ((volume_before - signed_volume(trial)) / gradient.length_squared)


def merged_vertex(trial, target):
    return min(trial.verts, key=lambda vertex: (vertex.co - target).length)


def try_collapse(surface, edge_index, target_index, probe, open_before):
    trial = surface.copy()
    trial.edges.ensure_lookup_table()
    edge = trial.edges[edge_index]
    target = collapse_targets(edge)[target_index]
    volume_before = signed_volume(surface)
    for vertex in edge.verts:
        vertex.co = target
    bmesh.ops.collapse(trial, edges=[edge])
    merged = merged_vertex(trial, target)
    restore_volume(trial, merged, volume_before)
    trial.normal_update()
    if open_and_non_manifold_edges(trial) == open_before and stays_on_surface(merged, probe.tree, probe.tolerance) and keeps_reference_covered(trial, probe):
        return trial
    trial.free()
    return None


def vertex_signature(vertex):
    return tuple(round(c, 5) for c in vertex.co)


def flatness(vertex):
    mean = sum((face.normal for face in vertex.link_faces), Vector((0, 0, 0))).normalized()
    return min(face.normal.dot(mean) for face in vertex.link_faces)


def flat_vertices(surface, angle_deg):
    threshold = cos(radians(angle_deg))
    interior = [v for v in surface.verts if len(v.link_faces) >= 3 and not any(e.is_boundary for e in v.link_edges)]
    return sorted((v for v in interior if flatness(v) >= threshold), key=flatness, reverse=True)


def collapse_edges(surface, edges, probe, open_before):
    surface.edges.index_update()
    for edge in sorted(edges, key=lambda candidate: candidate.calc_length()):
        for target_index in range(3):
            trial = try_collapse(surface, edge.index, target_index, probe, open_before)
            if trial is not None:
                return trial
    return None


def collapse_while_possible(surface, find_pending, signature, edges_of, probe, open_before):
    unfixable = set()
    while True:
        pending = [item for item in find_pending(surface) if signature(item) not in unfixable]
        if not pending:
            return surface
        trial = collapse_edges(surface, edges_of(pending[0]), probe, open_before)
        if trial is None:
            unfixable.add(signature(pending[0]))
        else:
            surface.free()
            surface = trial


def simplify_folds(surface, reference, length, settings):
    limit = fold_limit(length, settings)
    probe = ReferenceProbe(reference, surface, settings["fold_tolerance_ratio"] * length)
    open_before = open_and_non_manifold_edges(surface)
    surface = collapse_while_possible(
        surface, lambda mesh: narrow_faces(mesh, limit), face_signature, lambda face: face.edges, probe, open_before
    )
    if settings["flat_vertex_angle_deg"] > 0:
        surface = collapse_while_possible(
            surface,
            lambda mesh: flat_vertices(mesh, settings["flat_vertex_angle_deg"]),
            vertex_signature,
            lambda vertex: vertex.link_edges,
            probe,
            open_before,
        )
    return surface
