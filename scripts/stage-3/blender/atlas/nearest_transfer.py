"""Colour transfer by closest point: every texel of the simplified figure takes the colour of the nearest point on
the detailed surface. Rays along a big flat face cross concave areas (an eye socket) and pick colour from the
wrong side; the closest point stays on the part of the figure the texel actually stands for."""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def triangles(mesh):
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    loops = np.empty(count * 3, dtype=np.int64)
    vertices = np.empty(count * 3, dtype=np.int64)
    mesh.loop_triangles.foreach_get("loops", loops)
    mesh.loop_triangles.foreach_get("vertices", vertices)
    positions = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", positions)
    uvs = np.empty(len(mesh.loops) * 2)
    mesh.uv_layers.active.data.foreach_get("uv", uvs)
    return positions.reshape(-1, 3)[vertices].reshape(count, 3, 3), uvs.reshape(-1, 2)[loops].reshape(count, 3, 2)


def texture_pixels(image):
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)


def texel_points(corners, uvs, size):
    """3D point under the centre of every texel covered by each simplified triangle."""
    found_rows, found_cols, found_points = [], [], []
    for corner, uv in zip(corners, uvs):
        pixel = uv * size
        low = np.floor(pixel.min(axis=0)).astype(int)
        high = np.ceil(pixel.max(axis=0)).astype(int)
        cols, rows = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
        centres = np.stack([cols.ravel() + 0.5, rows.ravel() + 0.5], axis=1)
        weights = barycentric(centres, pixel)
        inside = (weights >= -1e-3).all(axis=1)
        found_rows.append(rows.ravel()[inside])
        found_cols.append(cols.ravel()[inside])
        found_points.append(weights[inside] @ corner)
    return np.concatenate(found_rows), np.concatenate(found_cols), np.concatenate(found_points)


def barycentric(points, triangle):
    a, b, c = triangle
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-12:
        return np.full((len(points), 3), -1.0)
    w0 = ((b[1] - c[1]) * (points[:, 0] - c[0]) + (c[0] - b[0]) * (points[:, 1] - c[1])) / denominator
    w1 = ((c[1] - a[1]) * (points[:, 0] - c[0]) + (a[0] - c[0]) * (points[:, 1] - c[1])) / denominator
    return np.stack([w0, w1, 1.0 - w0 - w1], axis=1)


def sample_detailed(points, detailed_corners, detailed_uvs, tree, texture):
    colours = np.zeros((len(points), 4), dtype=np.float32)
    for index, point in enumerate(points):
        location, _, face, _ = tree.find_nearest(Vector(point))
        if location is None:
            continue
        corner = detailed_corners[face]
        weights = spatial_barycentric(np.array(location), corner)
        colours[index] = bilinear(texture, weights @ detailed_uvs[face])
    return colours


def bilinear(texture, uv):
    """Interpolated texture colour, so edges inside a detail (an iris) stay smooth instead of stair-stepped."""
    height, width = texture.shape[:2]
    x = np.clip((uv[0] % 1.0) * width - 0.5, 0, width - 1.001)
    y = np.clip((uv[1] % 1.0) * height - 0.5, 0, height - 1.001)
    col, row = int(x), int(y)
    fx, fy = x - col, y - row
    top = texture[row, col] * (1 - fx) + texture[row, col + 1] * fx
    bottom = texture[row + 1, col] * (1 - fx) + texture[row + 1, col + 1] * fx
    return top * (1 - fy) + bottom * fy


def spatial_barycentric(point, corner):
    first, second = corner[1] - corner[0], corner[2] - corner[0]
    offset = point - corner[0]
    d00, d01, d11 = first @ first, first @ second, second @ second
    d20, d21 = offset @ first, offset @ second
    denominator = max(d00 * d11 - d01 * d01, 1e-18)
    v = (d11 * d20 - d01 * d21) / denominator
    w = (d00 * d21 - d01 * d20) / denominator
    return np.clip(np.array([1.0 - v - w, v, w]), 0.0, 1.0)


def transfer(detailed_mesh, detailed_image, simple_mesh, atlas_image):
    """Fills the atlas of the simplified mesh (rows bottom-up, as Blender) from the detailed mesh."""
    size = atlas_image.size[0]
    detailed_corners, detailed_uvs = triangles(detailed_mesh)
    flat_vertices = detailed_corners.reshape(-1, 3).tolist()
    flat_faces = np.arange(len(flat_vertices)).reshape(-1, 3).tolist()
    tree = BVHTree.FromPolygons(flat_vertices, flat_faces)
    simple_corners, simple_uvs = triangles(simple_mesh)
    rows, cols, points = texel_points(simple_corners, simple_uvs, size)
    colours = sample_detailed(points, detailed_corners, detailed_uvs, tree, texture_pixels(detailed_image))
    atlas = np.zeros((size, size, 4), dtype=np.float32)
    keep = (rows >= 0) & (rows < size) & (cols >= 0) & (cols < size)
    atlas[rows[keep], cols[keep]] = colours[keep]
    atlas_image.pixels.foreach_set(atlas.ravel())
    return int(keep.sum())
