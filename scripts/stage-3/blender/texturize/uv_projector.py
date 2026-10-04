from mathutils import Vector


def assign_orthogonal_uvs(surface, views_data: dict, names: list, chosen_indices: list):
    layer = surface.loops.layers.uv.new("UVMap")
    centre = Vector(views_data["centre"])

    for face, position in zip(surface.faces, chosen_indices):
        view = views_data["views"][names[position]]
        right = Vector(view["right"])
        up = Vector(view["up"])
        scale = float(view["orthoScale"])

        face.material_index = position
        for loop in face.loops:
            relative = loop.vert.co - centre
            u = 0.5 + relative.dot(right) / scale
            v = 0.5 + relative.dot(up) / scale
            loop[layer].uv = (u, v)
