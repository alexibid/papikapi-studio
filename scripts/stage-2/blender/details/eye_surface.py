"""Finds the two eyes TRELLIS painted on the model: clusters of triangles whose texture has the iris colour."""
from collections import deque
from dataclasses import dataclass

import numpy as np

from eye_color import ColorSignature, matches


@dataclass
class SurfaceMesh:
    """Triangulated mesh with per-corner UVs and the base colour texture (rows bottom to top, as Blender)."""
    corners: np.ndarray      # (T, 3, 3) world positions
    uvs: np.ndarray          # (T, 3, 2)
    normals: np.ndarray      # (T, 3) unit normals
    areas: np.ndarray        # (T,)
    texture: np.ndarray      # (H, W, 4)


@dataclass
class SurfaceEye:
    centre: np.ndarray
    normal: np.ndarray
    right: np.ndarray        # points away from the other eye
    up: np.ndarray
    area: float


def read_surface(mesh, image) -> SurfaceMesh:
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    loops = np.empty(count * 3, dtype=np.int64)
    vertices = np.empty(count * 3, dtype=np.int64)
    mesh.loop_triangles.foreach_get("loops", loops)
    mesh.loop_triangles.foreach_get("vertices", vertices)
    positions = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", positions)
    uv_data = np.empty(len(mesh.loops) * 2, dtype=np.float64)
    mesh.uv_layers.active.data.foreach_get("uv", uv_data)
    corners = positions.reshape(-1, 3)[vertices].reshape(count, 3, 3)
    cross = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    length = np.linalg.norm(cross, axis=1)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return SurfaceMesh(corners=corners, uvs=uv_data.reshape(-1, 2)[loops].reshape(count, 3, 2),
                       normals=cross / np.maximum(length, 1e-12)[:, None], areas=length / 2.0,
                       texture=pixels.reshape(height, width, 4))


def sample(texture: np.ndarray, uv: np.ndarray) -> np.ndarray:
    height, width = texture.shape[:2]
    cols = np.clip((uv[:, 0] % 1.0) * width, 0, width - 1).astype(np.int64)
    rows = np.clip((uv[:, 1] % 1.0) * height, 0, height - 1).astype(np.int64)
    return texture[rows, cols, :3]


def clusters(points: np.ndarray, cell: float) -> list[np.ndarray]:
    """Groups points that touch through a grid of the given cell size (26-neighbourhood)."""
    keys = np.floor(points / cell).astype(np.int64)
    by_cell: dict = {}
    for index, key in enumerate(map(tuple, keys)):
        by_cell.setdefault(key, []).append(index)
    seen, groups = set(), []
    offsets = [(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1)]
    for start in by_cell:
        if start in seen:
            continue
        seen.add(start)
        queue, members = deque([start]), []
        while queue:
            key = queue.popleft()
            members.extend(by_cell[key])
            for dx, dy, dz in offsets:
                near = (key[0] + dx, key[1] + dy, key[2] + dz)
                if near in by_cell and near not in seen:
                    seen.add(near)
                    queue.append(near)
        groups.append(np.array(members))
    return groups


def summarise(surface: SurfaceMesh, members: np.ndarray, model_centre: np.ndarray) -> dict:
    """Centre, outward normal and area of a cluster. TRELLIS meshes mix triangle windings, so every normal is
    first turned to point away from the model centre before averaging."""
    weights = surface.areas[members]
    centre = (surface.corners[members].mean(axis=1) * weights[:, None]).sum(axis=0) / weights.sum()
    normals = surface.normals[members]
    normals = normals * np.sign(normals @ (centre - model_centre) + 1e-12)[:, None]
    normal = (normals * weights[:, None]).sum(axis=0)
    return {"centre": centre, "normal": normal / np.linalg.norm(normal), "area": float(weights.sum())}


def eye_pair(surface: SurfaceMesh, signature: ColorSignature, settings: dict) -> list[SurfaceEye]:
    centroids_uv = surface.uvs.mean(axis=1)
    iris = np.nonzero(matches(sample(surface.texture, centroids_uv), signature, settings))[0]
    if len(iris) == 0:
        raise RuntimeError("No iris-coloured texture found on the model")
    span = np.ptp(surface.corners.reshape(-1, 3), axis=0).max()
    model_centre = surface.corners.reshape(-1, 3).mean(axis=0)
    groups = [summarise(surface, iris[members], model_centre)
              for members in clusters(surface.corners[iris].mean(axis=1), span * settings["cluster_cell_ratio"])]
    groups.sort(key=lambda group: -group["area"])
    best, best_score = None, 0.0
    for index, first in enumerate(groups[:8]):
        for second in groups[index + 1:8]:
            ratio = min(first["area"], second["area"]) / max(first["area"], second["area"])
            apart = np.linalg.norm(first["centre"] - second["centre"]) / span
            if ratio < settings["pair_size_ratio_min"] or apart > settings["pair_distance_max_ratio"]:
                continue
            if ratio * (first["area"] + second["area"]) > best_score:
                best, best_score = (first, second), ratio * (first["area"] + second["area"])
    if best is None:
        raise RuntimeError("No pair of eyes found on the model texture")
    middle = (best[0]["centre"] + best[1]["centre"]) / 2.0
    return [frame(group, middle) for group in best]


def frame(group: dict, middle: np.ndarray) -> SurfaceEye:
    normal = group["normal"]
    outward = group["centre"] - middle
    right = outward - outward.dot(normal) * normal
    right /= np.linalg.norm(right)
    up = np.cross(normal, right)
    if up[2] < 0:
        up = -up
    return SurfaceEye(centre=group["centre"], normal=normal, right=right, up=up, area=group["area"])
