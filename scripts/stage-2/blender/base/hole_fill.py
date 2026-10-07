import bmesh
from mathutils import Vector


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
