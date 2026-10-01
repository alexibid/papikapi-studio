import bmesh
from mathutils import Vector

TWIST_TOLERANCE = 0.01


def is_twisted(face):
    if len(face.verts) <= 3:
        return False
    center = face.calc_center_median()
    plane_offset = center.dot(face.normal)
    diameter = max((center - vertex.co).length for vertex in face.verts)
    return any(abs(vertex.co.dot(face.normal) - plane_offset) > TWIST_TOLERANCE * diameter for vertex in face.verts)


def twisted_faces(mesh_builder):
    mesh_builder.normal_update()
    return [face for face in mesh_builder.faces if is_twisted(face)]


def projection_onto_plane(face, vertex):
    offset = (vertex.co - face.calc_center_median()).dot(face.normal)
    return vertex.co - face.normal * offset


def flatten_once(mesh_builder, faces):
    targets = {}
    for face in faces:
        for vertex in face.verts:
            targets.setdefault(vertex, []).append(projection_onto_plane(face, vertex))
    for vertex, positions in targets.items():
        vertex.co = sum(positions, Vector()) / len(positions)


def flatten_quads(mesh_builder, iterations):
    for _ in range(iterations):
        faces = twisted_faces(mesh_builder)
        if not faces:
            return
        flatten_once(mesh_builder, faces)


def triangulate_twisted(mesh_builder):
    bmesh.ops.triangulate(mesh_builder, faces=twisted_faces(mesh_builder))
