from mathutils import Vector


def find_plinth_faces(mesh_builder):
    if not mesh_builder.verts:
        return None
    min_z = min(v.co.z for v in mesh_builder.verts)
    unvisited = set(mesh_builder.faces)
    components = []
    while unvisited:
        start = unvisited.pop()
        component = [start]
        frontier = [start]
        while frontier:
            current = frontier.pop()
            for edge in current.edges:
                for linked in edge.link_faces:
                    if linked in unvisited:
                        unvisited.remove(linked)
                        component.append(linked)
                        frontier.append(linked)
        components.append(component)

    for comp in components:
        if len(comp) == 5 and all(len(f.verts) == 4 for f in comp):
            comp_min_z = min(v.co.z for f in comp for v in f.verts)
            if abs(comp_min_z - min_z) < 1e-4:
                return comp
    return None


class PlinthPiece:
    def __init__(self, placement):
        self.placement = placement


def create_plinth_piece(plinth_faces):
    top_face = max(plinth_faces, key=lambda f: f.calc_center_median().z)
    wall_faces = [f for f in plinth_faces if f != top_face]

    top_verts = list(top_face.verts)
    xs = [v.co.x for v in top_verts]
    ys = [v.co.y for v in top_verts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    W = max_x - min_x
    D = max_y - min_y

    bottom_verts = {v for f in wall_faces for v in f.verts if v not in top_verts}
    H = top_face.calc_center_median().z - min(v.co.z for v in bottom_verts)

    def corner_key(v):
        dx = 0 if abs(v.co.x - min_x) < abs(v.co.x - max_x) else 1
        dy = 0 if abs(v.co.y - min_y) < abs(v.co.y - max_y) else 1
        return (dx, dy)

    v_map = {corner_key(v): v for v in top_verts}
    c0, c1, c2, c3 = v_map[(0, 0)], v_map[(1, 0)], v_map[(1, 1)], v_map[(0, 1)]

    # Layout top face
    top_placement = {
        c0: Vector((H, H)),
        c1: Vector((H + W, H)),
        c2: Vector((H + W, H + D)),
        c3: Vector((H, H + D)),
    }

    placement = {top_face: top_placement}

    edges_info = [
        ((c0, c1), Vector((H, 0)), Vector((H + W, 0))),
        ((c1, c2), Vector((H + W + H, H)), Vector((H + W + H, H + D))),
        ((c2, c3), Vector((H + W, H + D + H)), Vector((H, H + D + H))),
        ((c3, c0), Vector((0, H + D)), Vector((0, H))),
    ]

    for (start_v, end_v), b_start_pos, b_end_pos in edges_info:
        wall = next(f for f in wall_faces if start_v in f.verts and end_v in f.verts)
        other_verts = [v for v in wall.verts if v not in (start_v, end_v)]
        b_start_v = min(other_verts, key=lambda v: (v.co.x - start_v.co.x) ** 2 + (v.co.y - start_v.co.y) ** 2)
        b_end_v = next(v for v in other_verts if v != b_start_v)

        placement[wall] = {
            start_v: top_placement[start_v],
            end_v: top_placement[end_v],
            b_start_v: b_start_pos,
            b_end_v: b_end_pos,
        }

    # If wider than tall, rotate by 90 degrees to fit portrait page
    if (W + 2 * H) > (D + 2 * H):
        for face, v_dict in placement.items():
            for v, pt in v_dict.items():
                v_dict[v] = Vector((pt.y, pt.x))

    return PlinthPiece(placement)
