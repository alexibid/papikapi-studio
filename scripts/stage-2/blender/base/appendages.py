from math import degrees, pi

import bmesh
import numpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

DEGENERATE_FACE_MM = 0.2


def thickness_mm(face, tree, to_mm):
    hit = tree.ray_cast(face.calc_center_median() - face.normal * 1e-6, -face.normal)
    return None if hit[0] is None else hit[3] * to_mm


def is_degenerate(face, to_mm):
    longest = max(edge.calc_length() for edge in face.edges)
    return longest == 0 or 2 * face.calc_area() / longest * to_mm < DEGENERATE_FACE_MM


def face_thicknesses(surface, to_mm):
    tree = BVHTree.FromBMesh(surface)
    return {face: None if is_degenerate(face, to_mm) else thickness_mm(face, tree, to_mm) for face in surface.faces}


def faces_thinner_than(thicknesses, limit_mm):
    return {face for face, value in thicknesses.items() if value is not None and value < limit_mm}


def connected_clusters(faces):
    seen, clusters = set(), []
    for start in faces:
        if start in seen:
            continue
        stack, cluster = [start], []
        seen.add(start)
        while stack:
            current = stack.pop()
            cluster.append(current)
            for edge in current.edges:
                for neighbour in edge.link_faces:
                    if neighbour in faces and neighbour not in seen:
                        seen.add(neighbour)
                        stack.append(neighbour)
        clusters.append(cluster)
    return clusters


def principal_extents_mm(cluster, to_mm):
    points = numpy.array([tuple(vertex.co) for face in cluster for vertex in face.verts])
    centred = points - points.mean(axis=0)
    axes = numpy.linalg.eigh(numpy.cov(centred.T))[1]
    spans = [numpy.ptp(centred @ axes[:, index]) * to_mm for index in range(3)]
    return sorted(spans, reverse=True)


def is_appendage(extents, settings):
    length, section, _ = extents
    long_enough = length >= settings["appendage_min_length_mm"]
    narrow_enough = section <= settings["appendage_max_section_mm"]
    return long_enough and narrow_enough and length >= settings["appendage_min_aspect"] * section


def is_body_crease(edge, settings):
    return len(edge.link_faces) == 2 and not edge.is_convex and degrees(edge.calc_face_angle()) >= settings["appendage_crease_deg"]


def boundary_length_mm(faces, to_mm):
    edges = {edge for face in faces for edge in face.edges}
    return sum(edge.calc_length() for edge in edges if any(n not in faces for n in edge.link_faces)) * to_mm


def next_ring(reached, settings):
    ring = set()
    for face in reached:
        for edge in face.edges:
            if not is_body_crease(edge, settings):
                ring.update(n for n in edge.link_faces if n not in reached)
    return ring


def follow_to_body(cluster, length, settings):
    to_mm = settings["target_size_mm"] / length
    reached = set(cluster)
    limit = boundary_length_mm(reached, to_mm) + pi * settings["appendage_root_section_mm"]
    for _ in range(settings["appendage_max_rings"]):
        ring = next_ring(reached, settings)
        if not ring or boundary_length_mm(reached | ring, to_mm) > limit:
            break
        reached |= ring
    return list(reached)


def thin_clusters(surface, length, settings):
    to_mm = settings["target_size_mm"] / length
    thin = faces_thinner_than(face_thicknesses(surface, to_mm), settings["min_feature_mm"])
    return [(cluster, principal_extents_mm(cluster, to_mm)) for cluster in connected_clusters(thin)]


def plate_vertices(clusters, settings):
    wide = [cluster for cluster, extents in clusters if extents[1] > settings["appendage_max_section_mm"]]
    return [vertex.co for cluster in wide for face in cluster for vertex in face.verts]


def rims_a_plate(cluster, plate_tree, reach):
    return any(plate_tree.find_range(vertex.co, reach) for face in cluster for vertex in face.verts)


def removable_clusters(clusters, length, settings):
    points = plate_vertices(clusters, settings)
    plate_tree = KDTree(len(points))
    for index, point in enumerate(points):
        plate_tree.insert(point, index)
    plate_tree.balance()
    reach = settings["appendage_plate_clearance_mm"] * length / settings["target_size_mm"]
    return [
        cluster for cluster, extents in clusters
        if is_appendage(extents, settings) and not rims_a_plate(cluster, plate_tree, reach)
    ]


def find_appendages(surface, length, settings):
    clusters = thin_clusters(surface, length, settings)
    return [follow_to_body(cluster, length, settings) for cluster in removable_clusters(clusters, length, settings)]


def boundary_loops(surface):
    pending = {edge for edge in surface.edges if edge.is_boundary}
    loops = []
    while pending:
        loop = [pending.pop()]
        grew = True
        while grew:
            grew = False
            vertices = {vertex for edge in loop for vertex in edge.verts}
            for edge in [e for e in pending if any(v in vertices for v in e.verts)]:
                pending.discard(edge)
                loop.append(edge)
                grew = True
        loops.append(loop)
    return loops


def ordered_vertices(loop):
    neighbours = {}
    for edge in loop:
        for vertex in edge.verts:
            neighbours.setdefault(vertex, []).append(edge.other_vert(vertex))
    if any(len(around) != 2 for around in neighbours.values()):
        return []
    start = next(iter(neighbours))
    ordered, previous = [start], None
    while True:
        following = [v for v in neighbours[ordered[-1]] if v is not previous][0]
        if following is start:
            return ordered
        previous = ordered[-1]
        ordered.append(following)


def neighbour_uv(edge, vertex, uv_layer, new_faces):
    face = next(candidate for candidate in edge.link_faces if candidate not in new_faces)
    return next(loop[uv_layer].uv.copy() for loop in face.loops if loop.vert is vertex)


def fan_fill(surface, vertices):
    uv_layer = surface.loops.layers.uv.active
    centre = surface.verts.new(sum((vertex.co for vertex in vertices), Vector()) / len(vertices))
    fan = []
    for index, vertex in enumerate(vertices):
        following = vertices[(index + 1) % len(vertices)]
        edge = surface.edges.get((vertex, following))
        first = neighbour_uv(edge, vertex, uv_layer, fan) if uv_layer else None
        second = neighbour_uv(edge, following, uv_layer, fan) if uv_layer else None
        face = surface.faces.new((vertex, following, centre))
        fan.append(face)
        if uv_layer:
            corners = {loop.vert: loop for loop in face.loops}
            corners[vertex][uv_layer].uv = first
            corners[following][uv_layer].uv = second
            corners[centre][uv_layer].uv = (first + second) / 2


def close_each_hole(surface):
    for loop in boundary_loops(surface):
        vertices = ordered_vertices(loop)
        if vertices:
            fan_fill(surface, vertices)
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)


def remove_one_pass(surface, length, settings):
    appendages = find_appendages(surface, length, settings)
    doomed = list({face for cluster in appendages for face in cluster})
    if doomed:
        bmesh.ops.delete(surface, geom=doomed, context="FACES")
        close_each_hole(surface)
    return len(appendages), len(doomed)


def remove_appendages(surface, length, settings):
    removed, removed_faces = 0, 0
    for _ in range(settings["appendage_max_passes"]):
        found, faces = remove_one_pass(surface, length, settings)
        if not found:
            break
        removed, removed_faces = removed + found, removed_faces + faces
    return {"appendages": removed, "appendageFaces": removed_faces}
