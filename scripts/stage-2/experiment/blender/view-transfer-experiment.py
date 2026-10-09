"""Experiment: carry a correction seen in the six orthographic views back to the atlas, only where a texel is visible
from a view and faces it. Colours never travel, only the (smooth) difference between the original view and the edited one.

Input maps: float array (views, size, size, 4) with the lightness/a/b difference and the silhouette (rows from the top)."""
import importlib.util
import json
import sys
import traceback
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
FRAMING = 1.12
SURFACE_OFFSET = 1e-3
VIEWS = {
    "front": ((0, 1, 0), (0, 0, 1)),
    "back": ((0, -1, 0), (0, 0, 1)),
    "left": ((1, 0, 0), (0, 0, 1)),
    "right": ((-1, 0, 0), (0, 0, 1)),
    "top": ((0, 0, -1), (0, 1, 0)),
    "bottom": ((0, 0, 1), (0, -1, 0)),
}

specification = importlib.util.spec_from_file_location("occlusion_experiment", Path(__file__).with_name("ambient-occlusion-experiment.py"))
occlusion = importlib.util.module_from_spec(specification)
specification.loader.exec_module(occlusion)


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def bounds(figure) -> tuple[Vector, float]:
    corners = [figure.matrix_world @ Vector(corner) for corner in figure.bound_box]
    low = Vector(min(point[axis] for point in corners) for axis in range(3))
    high = Vector(max(point[axis] for point in corners) for axis in range(3))
    return (low + high) / 2.0, max(high - low)


def project(points: np.ndarray, centre: Vector, extent: float, direction: Vector, up: Vector) -> tuple[np.ndarray, np.ndarray]:
    right = up.cross(-direction).normalized()
    relative = points - np.array(centre)
    scale = extent * FRAMING
    return 0.5 + relative @ np.array(right) / scale, 0.5 - relative @ np.array(up) / scale


def visible_texels(tree, points, normals, direction: Vector, candidates: np.ndarray, extent: float) -> np.ndarray:
    towards_camera = -direction
    visible = np.zeros(len(points), dtype=bool)
    for index in np.flatnonzero(candidates):
        origin = Vector(points[index] + normals[index] * SURFACE_OFFSET * extent)
        visible[index] = tree.ray_cast(origin, towards_camera, extent * 4.0)[0] is None
    return visible


def transfer(settings: dict) -> dict:
    figure = occlusion.import_model(settings["glb"])
    size = int(settings["resolution"])
    maps = np.load(settings["maps_npy"])
    centre, extent = bounds(figure)
    tree = BVHTree.FromObject(figure, bpy.context.evaluated_depsgraph_get())
    rows, columns, points, normals = occlusion.texel_samples(figure.data, size)
    normals = normals / np.linalg.norm(normals, axis=1, keepdims=True)
    total, weight = np.zeros((len(points), 3)), np.zeros(len(points))
    for view_index, (direction, up) in enumerate(VIEWS.values()):
        direction, up = Vector(direction), Vector(up)
        facing = normals @ np.array(-direction)
        x, y = project(points, centre, extent, direction, up)
        column, row = np.clip((x * size).astype(int), 0, size - 1), np.clip((y * size).astype(int), 0, size - 1)
        seen = maps[view_index][row, column, 3] > 0.5
        candidates = (facing > float(settings["min_facing"])) & seen
        visible = visible_texels(tree, points, normals, direction, candidates, extent)
        share = np.where(visible, facing**2, 0.0)
        total += maps[view_index][row, column, :3] * share[:, None]
        weight += share
    result = np.zeros((size, size, 4), dtype=np.float32)
    result[rows, columns, :3] = total / np.maximum(weight, 1e-6)[:, None]
    result[rows, columns, 3] = weight
    np.save(settings["output_npy"], result)
    return {"texels": int(len(points)), "seenShare": round(float((weight > 0).mean()), 3)}


if __name__ == "__main__":
    try:
        print(RESULT_MARKER + json.dumps(transfer(read_settings())))
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
