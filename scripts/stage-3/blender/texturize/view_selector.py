from mathutils import Vector


def choose_best_views(surface, views_data: dict, tree, reach: float, min_facing: float = 0.2):
    names = list(views_data["views"])
    chosen = []
    hidden_count = 0

    for face in surface.faces:
        centre = face.calc_center_median()
        ranked = []
        for position, name in enumerate(names):
            direction = Vector(views_data["views"][name]["direction"])
            facing = -face.normal.dot(direction)
            if facing < min_facing:
                continue
            hit = tree.ray_cast(centre - direction * reach, direction, reach * 2.0)
            clear = hit[2] is None or hit[2] == face.index or abs(hit[3] - reach) < reach * 1e-3
            ranked.append((clear, facing, position))

        if not ranked:
            ranked = [
                (False, -face.normal.dot(Vector(views_data["views"][n]["direction"])), i)
                for i, n in enumerate(names)
            ]

        ranked.sort(reverse=True)
        if not ranked[0][0]:
            hidden_count += 1
        chosen.append(ranked[0][2])

    return names, chosen, hidden_count
