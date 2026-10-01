from math import atan2, cos, inf, sin

PACKING_ITERATIONS = 40


def plane_coordinates(polygon, vertices):
    points = [vertices[index].co for index in polygon.vertices]
    first_edge = points[1] - points[0]
    axis_u = (first_edge - polygon.normal * first_edge.dot(polygon.normal)).normalized()
    axis_v = polygon.normal.cross(axis_u)
    return [((point - points[0]).dot(axis_u), (point - points[0]).dot(axis_v)) for point in points]


def turn(point, angle):
    return (point[0] * cos(angle) - point[1] * sin(angle), point[0] * sin(angle) + point[1] * cos(angle))


def extent(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def tightest_frame(coordinates):
    best = None
    for index, start in enumerate(coordinates):
        end = coordinates[(index + 1) % len(coordinates)]
        angle = -atan2(end[1] - start[1], end[0] - start[0])
        turned = [turn(point, angle) for point in coordinates]
        left, bottom, width, height = extent(turned)
        if best is None or width * height < best[0]:
            best = (width * height, [(x - left, y - bottom) for x, y in turned], width, height)
    return best[1], best[2], best[3]


def build_islands(mesh):
    return {polygon.index: tightest_frame(plane_coordinates(polygon, mesh.vertices)) for polygon in mesh.polygons}


def shelf_positions(sizes, atlas):
    positions = {}
    cursor_x, cursor_y, shelf_height = 0.0, 0.0, 0.0
    for key, (width, height) in sorted(sizes.items(), key=lambda item: -item[1][1]):
        if cursor_x + width > atlas:
            cursor_x, cursor_y, shelf_height = 0.0, cursor_y + shelf_height, 0.0
        if width > atlas or cursor_y + height > atlas:
            return None
        positions[key] = (cursor_x, cursor_y)
        cursor_x += width
        shelf_height = max(shelf_height, height)
    return positions


def packed_sizes(islands, density, padding):
    return {key: (width * density + 2 * padding, height * density + 2 * padding) for key, (_, width, height) in islands.items()}


def densest_packing(islands, atlas, padding):
    low, high = 0.0, float(atlas) / 1e-3
    best = None
    for _ in range(PACKING_ITERATIONS):
        density = (low + high) / 2
        positions = shelf_positions(packed_sizes(islands, density, padding), atlas)
        if positions is None:
            high = density
        else:
            low, best = density, (density, positions)
    return best


def assign_uv(mesh, islands, atlas, padding):
    density, positions = densest_packing(islands, atlas, padding)
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        points, _, _ = islands[polygon.index]
        origin_x, origin_y = positions[polygon.index]
        for loop_index, (x, y) in zip(polygon.loop_indices, points):
            layer.data[loop_index].uv = ((origin_x + padding + x * density) / atlas, (origin_y + padding + y * density) / atlas)
    return density


def layout_islands(mesh, atlas, padding):
    return assign_uv(mesh, build_islands(mesh), atlas, padding)
