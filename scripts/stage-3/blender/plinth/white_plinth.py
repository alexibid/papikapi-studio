import bmesh


def footprint(surface, margin):
    verts = surface.verts if hasattr(surface, "verts") else surface.vertices
    xs = [vertex.co.x for vertex in verts]
    ys = [vertex.co.y for vertex in verts]
    return min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin


def ring(surface, bounds, level, grow):
    low_x, high_x, low_y, high_y = bounds
    corners = [
        (low_x - grow, low_y - grow),
        (high_x + grow, low_y - grow),
        (high_x + grow, high_y + grow),
        (low_x - grow, high_y + grow),
    ]
    return [surface.verts.new((x, y, level)) for x, y in corners]


def new_face(surface, corners, material_index):
    face = surface.faces.new(corners)
    face.material_index = material_index
    return face


def build_plinth_box(plinth_surface, bounds, thickness, slope, material_index=0):
    top = ring(plinth_surface, bounds, thickness, 0.0)
    bottom = ring(plinth_surface, bounds, 0.0, slope)

    plinth_faces = []
    for index in range(4):
        following = (index + 1) % 4
        plinth_faces.append(
            new_face(
                plinth_surface,
                [top[index], bottom[index], bottom[following], top[following]],
                material_index,
            )
        )
    plinth_faces.append(new_face(plinth_surface, top, material_index))
    bmesh.ops.recalc_face_normals(plinth_surface, faces=plinth_surface.faces)
    plinth_surface.normal_update()

    return {
        "thickness": thickness,
        "bounds": bounds,
        "plinth_faces": plinth_faces,
        "loops": 0,
    }


def add_white_plinth(surface, settings, length, material_index, bounds=None):
    if bounds is None:
        bounds = footprint(surface, settings["plinth_margin_ratio"] * length)
    thickness = settings["plinth_thickness_ratio"] * length
    slope = settings["plinth_slope_ratio"] * length
    return build_plinth_box(surface, bounds, thickness, slope, material_index)


