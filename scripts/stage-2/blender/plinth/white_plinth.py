import bmesh
from mathutils.geometry import tessellate_polygon

from figure_base import chain_loops

CAP_NORMAL = -0.9
CAP_HEIGHT_RATIO = 0.01


def foot_caps(surface, length):
    surface.normal_update()
    ceiling = min(vertex.co.z for vertex in surface.verts) + CAP_HEIGHT_RATIO * length
    return [face for face in surface.faces if face.normal.z < CAP_NORMAL and face.calc_center_median().z < ceiling]


def open_foot_loops(surface, length):
    bmesh.ops.delete(surface, geom=foot_caps(surface, length), context="FACES_ONLY")
    bmesh.ops.delete(surface, geom=[edge for edge in surface.edges if not edge.link_faces], context="EDGES")
    loops = chain_loops([edge for edge in surface.edges if edge.is_boundary])
    for loop in loops:
        for vertex in loop:
            vertex.co.z = 0.0
    return loops


def footprint(surface, margin):
    xs = [vertex.co.x for vertex in surface.verts]
    ys = [vertex.co.y for vertex in surface.verts]
    return min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin


def ring(surface, bounds, level, grow):
    low_x, high_x, low_y, high_y = bounds
    corners = [(low_x - grow, low_y - grow), (high_x + grow, low_y - grow), (high_x + grow, high_y + grow), (low_x - grow, high_y + grow)]
    return [surface.verts.new((x, y, level)) for x, y in corners]


def new_face(surface, corners, material_index):
    face = surface.faces.new(corners)
    face.material_index = material_index
    return face


def fill_top(surface, outer, loops, material_index):
    vertices = list(outer) + [vertex for loop in loops for vertex in loop]
    polylines = [[vertex.co.copy() for vertex in ring_vertices] for ring_vertices in [outer, *loops]]
    for indices in tessellate_polygon(polylines):
        corners = [vertices[index] for index in indices]
        if len({id(corner) for corner in corners}) < 3 or surface.faces.get(corners):
            continue
        normal = (corners[1].co - corners[0].co).cross(corners[2].co - corners[0].co)
        new_face(surface, corners if normal.z >= 0 else corners[::-1], material_index)


def add_white_plinth(surface, settings, length, material_index):
    loops = open_foot_loops(surface, length)
    bounds = footprint(surface, settings["plinth_margin_ratio"] * length)
    thickness = settings["plinth_thickness_ratio"] * length
    top = ring(surface, bounds, 0.0, 0.0)
    bottom = ring(surface, bounds, -thickness, settings["plinth_slope_ratio"] * length)
    new_face(surface, list(reversed(bottom)), material_index)
    for index in range(4):
        following = (index + 1) % 4
        new_face(surface, [top[index], bottom[index], bottom[following], top[following]], material_index)
    fill_top(surface, top, loops, material_index)
    bmesh.ops.translate(surface, vec=(0, 0, thickness), verts=surface.verts)
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    surface.normal_update()
    return {"loops": len(loops), "thickness": thickness}
