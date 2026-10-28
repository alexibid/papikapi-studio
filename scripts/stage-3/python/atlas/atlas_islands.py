"""Where each face lives on the atlas, and filling texels the bake missed with the nearest colour of the same face."""
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def island_map(uv_json_path: str, size: int) -> np.ndarray:
    """Face index (1-based) of every texel, 0 outside the faces. Rows top to bottom, like the PNG."""
    faces = json.load(open(uv_json_path))["faces"]
    canvas = Image.new("I", (size, size), 0)
    draw = ImageDraw.Draw(canvas)
    for index, polygon in enumerate(faces, start=1):
        points = [(u * size, (1.0 - v) * size) for u, v in polygon]
        draw.polygon(points, fill=index, outline=index)
    return np.asarray(canvas, dtype=np.int32)


def fill_missed(rgb: np.ndarray, valid: np.ndarray, islands: np.ndarray) -> np.ndarray:
    """Texels inside a face that the bake did not reach take the nearest reached texel of that same face."""
    filled = rgb.copy()
    missed = (islands > 0) & ~valid
    for face in np.unique(islands[missed]):
        rows, cols = ndimage.find_objects((islands == face).astype(np.int8))[0]
        inside = islands[rows, cols] == face
        known = inside & valid[rows, cols]
        if not known.any():
            continue
        _, (near_rows, near_cols) = ndimage.distance_transform_edt(~known, return_indices=True)
        patch = filled[rows, cols]
        hole = inside & ~known
        patch[hole] = patch[near_rows[hole], near_cols[hole]]
    return filled


def bleed(rgb: np.ndarray, covered: np.ndarray, margin_px: int) -> np.ndarray:
    """Copies edge colours a few texels past every face, so texture filtering never shows seams."""
    _, (near_rows, near_cols) = ndimage.distance_transform_edt(~covered, return_indices=True)
    distance = ndimage.distance_transform_edt(~covered)
    out = rgb.copy()
    reach = ~covered & (distance <= margin_px)
    out[reach] = rgb[near_rows[reach], near_cols[reach]]
    return out
