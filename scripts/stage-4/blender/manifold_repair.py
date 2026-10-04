import bmesh

MAX_REPAIR_PASSES = 60
ADDON_NULL_LIMIT = 1e-6
DEGENERATE_DISTANCE = 1e-6


def non_manifold_edges(mesh_builder):
    return [edge for edge in mesh_builder.edges if not edge.is_manifold]


def non_manifold_vertices(mesh_builder):
    return [vertex for vertex in mesh_builder.verts if not vertex.is_manifold]


def zero_area_faces(mesh_builder):
    return [face for face in mesh_builder.faces if face.calc_area() < ADDON_NULL_LIMIT]


def null_edges(mesh_builder):
    return [edge for edge in mesh_builder.edges if edge.calc_length() < ADDON_NULL_LIMIT and edge.link_faces]


def open_edges(mesh_builder):
    return [edge for edge in mesh_builder.edges if edge.is_boundary]


def faces_touching(edges, vertices):
    touching = {face for edge in edges for face in edge.link_faces}
    touching.update(face for vertex in vertices for face in vertex.link_faces)
    return touching


def collapse_degenerate(mesh_builder):
    flat = zero_area_faces(mesh_builder)
    doomed = {min(face.edges, key=lambda edge: edge.calc_length()) for face in flat}
    doomed.update(null_edges(mesh_builder))
    if not doomed:
        return False
    bmesh.ops.collapse(mesh_builder, edges=list(doomed))
    bmesh.ops.dissolve_degenerate(mesh_builder, edges=mesh_builder.edges, dist=DEGENERATE_DISTANCE)
    return True


def discard_loose_geometry(mesh_builder):
    loose_edges = [edge for edge in mesh_builder.edges if not edge.link_faces]
    bmesh.ops.delete(mesh_builder, geom=loose_edges, context="EDGES")
    loose_vertices = [vertex for vertex in mesh_builder.verts if not vertex.link_faces]
    bmesh.ops.delete(mesh_builder, geom=loose_vertices, context="VERTS")


def close_holes(mesh_builder):
    boundary = open_edges(mesh_builder)
    if not boundary:
        return
    filled = bmesh.ops.holes_fill(mesh_builder, edges=boundary, sides=0)
    bmesh.ops.triangulate(mesh_builder, faces=filled["faces"])


def repair_manifold(mesh_builder):
    for _ in range(MAX_REPAIR_PASSES):
        collapsed = collapse_degenerate(mesh_builder)
        offenders = non_manifold_edges(mesh_builder)
        pinched = non_manifold_vertices(mesh_builder)
        gaps = open_edges(mesh_builder)
        if not collapsed and not offenders and not pinched and not gaps:
            return
        bmesh.ops.delete(mesh_builder, geom=list(faces_touching(offenders, pinched)), context="FACES_ONLY")
        discard_loose_geometry(mesh_builder)
        close_holes(mesh_builder)
        bmesh.ops.recalc_face_normals(mesh_builder, faces=mesh_builder.faces)
    raise RuntimeError("Mesh repair could not make the mesh manifold and closed")
