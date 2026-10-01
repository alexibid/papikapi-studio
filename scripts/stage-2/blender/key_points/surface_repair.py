import bmesh

MAX_REPAIR_PASSES = 6


def boundary_edges(surface):
    return [edge for edge in surface.edges if edge.is_boundary]


def overused_faces(surface):
    faces = set()
    for edge in surface.edges:
        if len(edge.link_faces) > 2:
            faces.update(edge.link_faces)
    return list(faces)


def floating_faces(surface):
    return [face for face in surface.faces if all(edge.is_boundary for edge in face.edges)]


def close_holes(surface):
    edges = boundary_edges(surface)
    if not edges:
        return
    result = bmesh.ops.holes_fill(surface, edges=edges, sides=len(edges))
    bmesh.ops.triangulate(surface, faces=result["faces"])


def repair_surface(surface):
    for _ in range(MAX_REPAIR_PASSES):
        discarded = overused_faces(surface) + floating_faces(surface)
        if discarded:
            bmesh.ops.delete(surface, geom=discarded, context="FACES")
        bmesh.ops.dissolve_degenerate(surface, edges=surface.edges, dist=1e-9)
        close_holes(surface)
        if not boundary_edges(surface) and not overused_faces(surface):
            break
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    surface.normal_update()
