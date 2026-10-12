import bmesh

A4_PRINTABLE_WIDTH_M = 0.170
A4_PRINTABLE_HEIGHT_M = 0.245


def footprint(surface, margin):
    verts = surface.verts if hasattr(surface, "verts") else surface.vertices
    xs = [vertex.co.x for vertex in verts]
    ys = [vertex.co.y for vertex in verts]
    return min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin


def new_face(surface, corners, material_index):
    face = surface.faces.new(corners)
    face.material_index = material_index
    return face


def should_split_plinth(bounds, thickness, max_w=A4_PRINTABLE_WIDTH_M, max_h=A4_PRINTABLE_HEIGHT_M):
    low_x, high_x, low_y, high_y = bounds
    w = high_x - low_x
    d = high_y - low_y
    unfolded_w = w + 2 * thickness
    unfolded_d = d + 2 * thickness
    fits_straight = unfolded_w <= max_w and unfolded_d <= max_h
    fits_rotated = unfolded_d <= max_w and unfolded_w <= max_h
    return not (fits_straight or fits_rotated)


def build_plinth_box(plinth_surface, bounds, thickness, slope=0.0, material_index=0, force_split=None):
    low_x, high_x, low_y, high_y = bounds
    w = high_x - low_x
    d = high_y - low_y
    is_split = should_split_plinth(bounds, thickness) if force_split is None else force_split

    plinth_faces = []
    if not is_split:
        c0 = plinth_surface.verts.new((low_x, low_y, 0.0))
        c1 = plinth_surface.verts.new((high_x, low_y, 0.0))
        c2 = plinth_surface.verts.new((high_x, high_y, 0.0))
        c3 = plinth_surface.verts.new((low_x, high_y, 0.0))

        b0 = plinth_surface.verts.new((low_x, low_y, -thickness))
        b1 = plinth_surface.verts.new((high_x, low_y, -thickness))
        b2 = plinth_surface.verts.new((high_x, high_y, -thickness))
        b3 = plinth_surface.verts.new((low_x, high_y, -thickness))

        plinth_faces.append(new_face(plinth_surface, [c0, c1, c2, c3], material_index))
        plinth_faces.append(new_face(plinth_surface, [c0, b0, b1, c1], material_index))
        plinth_faces.append(new_face(plinth_surface, [c1, b1, b2, c2], material_index))
        plinth_faces.append(new_face(plinth_surface, [c2, b2, b3, c3], material_index))
        plinth_faces.append(new_face(plinth_surface, [c3, b3, b0, c0], material_index))
        split_axis = None
    else:
        split_axis = "x" if w >= d else "y"
        if split_axis == "x":
            mid_x = (low_x + high_x) / 2.0
            c0 = plinth_surface.verts.new((low_x, low_y, 0.0))
            c_mid_b = plinth_surface.verts.new((mid_x, low_y, 0.0))
            c1 = plinth_surface.verts.new((high_x, low_y, 0.0))
            c2 = plinth_surface.verts.new((high_x, high_y, 0.0))
            c_mid_t = plinth_surface.verts.new((mid_x, high_y, 0.0))
            c3 = plinth_surface.verts.new((low_x, high_y, 0.0))

            b0 = plinth_surface.verts.new((low_x, low_y, -thickness))
            b_mid_b = plinth_surface.verts.new((mid_x, low_y, -thickness))
            b1 = plinth_surface.verts.new((high_x, low_y, -thickness))
            b2 = plinth_surface.verts.new((high_x, high_y, -thickness))
            b_mid_t = plinth_surface.verts.new((mid_x, high_y, -thickness))
            b3 = plinth_surface.verts.new((low_x, high_y, -thickness))

            # Left half (Piece 1)
            plinth_faces.append(new_face(plinth_surface, [c0, c_mid_b, c_mid_t, c3], material_index))
            plinth_faces.append(new_face(plinth_surface, [c0, b0, b_mid_b, c_mid_b], material_index))
            plinth_faces.append(new_face(plinth_surface, [c3, b3, b0, c0], material_index))
            plinth_faces.append(new_face(plinth_surface, [c_mid_t, b_mid_t, b3, c3], material_index))

            # Right half (Piece 2)
            plinth_faces.append(new_face(plinth_surface, [c_mid_b, c1, c2, c_mid_t], material_index))
            plinth_faces.append(new_face(plinth_surface, [c_mid_b, b_mid_b, b1, c1], material_index))
            plinth_faces.append(new_face(plinth_surface, [c1, b1, b2, c2], material_index))
            plinth_faces.append(new_face(plinth_surface, [c2, b2, b_mid_t, c_mid_t], material_index))
        else:
            mid_y = (low_y + high_y) / 2.0
            c0 = plinth_surface.verts.new((low_x, low_y, 0.0))
            c1 = plinth_surface.verts.new((high_x, low_y, 0.0))
            c_mid_r = plinth_surface.verts.new((high_x, mid_y, 0.0))
            c2 = plinth_surface.verts.new((high_x, high_y, 0.0))
            c3 = plinth_surface.verts.new((low_x, high_y, 0.0))
            c_mid_l = plinth_surface.verts.new((low_x, mid_y, 0.0))

            b0 = plinth_surface.verts.new((low_x, low_y, -thickness))
            b1 = plinth_surface.verts.new((high_x, low_y, -thickness))
            b_mid_r = plinth_surface.verts.new((high_x, mid_y, -thickness))
            b2 = plinth_surface.verts.new((high_x, high_y, -thickness))
            b3 = plinth_surface.verts.new((low_x, high_y, -thickness))
            b_mid_l = plinth_surface.verts.new((low_x, mid_y, -thickness))

            # Front half (Piece 1)
            plinth_faces.append(new_face(plinth_surface, [c0, c1, c_mid_r, c_mid_l], material_index))
            plinth_faces.append(new_face(plinth_surface, [c0, b0, b1, c1], material_index))
            plinth_faces.append(new_face(plinth_surface, [c1, b1, b_mid_r, c_mid_r], material_index))
            plinth_faces.append(new_face(plinth_surface, [c_mid_l, b_mid_l, b0, c0], material_index))

            # Back half (Piece 2)
            plinth_faces.append(new_face(plinth_surface, [c_mid_l, c_mid_r, c2, c3], material_index))
            plinth_faces.append(new_face(plinth_surface, [c2, b2, b3, c3], material_index))
            plinth_faces.append(new_face(plinth_surface, [c_mid_r, b_mid_r, b2, c2], material_index))
            plinth_faces.append(new_face(plinth_surface, [c3, b3, b_mid_l, c_mid_l], material_index))

    bmesh.ops.recalc_face_normals(plinth_surface, faces=plinth_faces)
    plinth_surface.normal_update()

    return {
        "thickness": thickness,
        "bounds": bounds,
        "plinth_faces": plinth_faces,
        "is_split": is_split,
        "split_axis": split_axis,
        "loops": 0,
    }


def add_white_plinth(surface, settings, length, material_index, bounds=None):
    if bounds is None:
        bounds = footprint(surface, settings["plinth_margin_ratio"] * length)
    thickness = settings["plinth_thickness_ratio"] * length
    slope = settings.get("plinth_slope_ratio", 0.0) * length
    return build_plinth_box(surface, bounds, thickness, slope, material_index)
