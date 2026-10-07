from math import degrees, pi

import bmesh
import numpy

from envelope import faces_outside_body
from hole_fill import close_each_hole


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


def touches_ground(cluster, to_mm, settings):
    lowest = min(vertex.co.z for face in cluster for vertex in face.verts)
    return lowest * to_mm < settings["appendage_ground_clearance_mm"]


def appendage_seeds(surface, length, settings):
    total = sum(face.calc_area() for face in surface.faces)
    limit = settings["envelope_max_area_ratio"] * total
    to_mm = settings["target_size_mm"] / length
    clusters = connected_clusters(faces_outside_body(surface, length, settings))
    return [
        cluster for cluster in clusters
        if sum(face.calc_area() for face in cluster) <= limit
        and not touches_ground(cluster, to_mm, settings)
        and is_appendage(principal_extents_mm(cluster, to_mm), settings)
    ]


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


def find_appendages(surface, length, settings):
    return [follow_to_body(cluster, length, settings) for cluster in appendage_seeds(surface, length, settings)]


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
