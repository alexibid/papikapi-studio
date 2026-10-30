"""Finds the two eyes on the FLUX art (the TRELLIS input) and cuts out the most visible one as a decal.

The art is the reference: the eye that shows most of its area (the one nearest the camera) is taken as the
true eye and later painted on both eyes of the model, mirrored on one side.
"""
from collections import deque

import bpy
import numpy as np

from eye_errors import NoEyesFound

from eye_color import ColorSignature, hsv


def load_rgba(path: str) -> np.ndarray:
    """Image as float RGBA, rows top to bottom."""
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)[::-1].copy()


def components(mask: np.ndarray) -> list[np.ndarray]:
    """4-connected components of a boolean mask, each as an array of (row, col)."""
    seen = np.zeros_like(mask, dtype=bool)
    found = []
    for start in zip(*np.nonzero(mask)):
        if seen[start]:
            continue
        seen[start] = True
        queue, cells = deque([start]), []
        while queue:
            row, col = queue.popleft()
            cells.append((row, col))
            for nrow, ncol in ((row + 1, col), (row - 1, col), (row, col + 1), (row, col - 1)):
                if 0 <= nrow < mask.shape[0] and 0 <= ncol < mask.shape[1] and mask[nrow, ncol] and not seen[nrow, ncol]:
                    seen[nrow, ncol] = True
                    queue.append((nrow, ncol))
        found.append(np.array(cells))
    return found


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fills enclosed holes (the pupil inside the iris) by flooding the background from the border."""
    padded = np.pad(~mask, 1, constant_values=True)
    outside = np.zeros_like(padded)
    queue = deque([(0, 0)])
    outside[0, 0] = True
    while queue:
        row, col = queue.popleft()
        for nrow, ncol in ((row + 1, col), (row - 1, col), (row, col + 1), (row, col - 1)):
            if 0 <= nrow < padded.shape[0] and 0 <= ncol < padded.shape[1] and padded[nrow, ncol] and not outside[nrow, ncol]:
                outside[nrow, ncol] = True
                queue.append((nrow, ncol))
    return ~outside[1:-1, 1:-1]


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    grown = mask.copy()
    for _ in range(max(radius, 0)):
        step = grown.copy()
        step[1:] |= grown[:-1]
        step[:-1] |= grown[1:]
        step[:, 1:] |= grown[:, :-1]
        step[:, :-1] |= grown[:, 1:]
        grown = step
    return grown


def eye_candidates(rgba: np.ndarray, settings: dict) -> list[dict]:
    hue, saturation, value = hsv(rgba[..., :3])
    figure = rgba[..., 3] > 0.5
    coloured = figure & (saturation >= settings["saturation_min"]) & (value >= settings["value_min"])
    figure_area = int(figure.sum())
    candidates = []
    for cells in components(coloured):
        area = len(cells)
        if not settings["eye_area_min_ratio"] * figure_area <= area <= settings["eye_area_max_ratio"] * figure_area:
            continue
        top, left = cells.min(axis=0)
        bottom, right = cells.max(axis=0) + 1
        if area / ((bottom - top) * (right - left)) < settings["eye_fill_min"]:
            continue
        candidates.append({"cells": cells, "area": area, "box": (top, left, bottom, right),
                           "centre": cells.mean(axis=0), "hue": float(np.median(hue[cells[:, 0], cells[:, 1]]))})
    return candidates


def best_pair(candidates: list[dict], settings: dict) -> tuple[dict, dict]:
    """The two blobs that look most like a pair of eyes: similar size, same hue, side by side."""
    best, best_score = None, 0.0
    for index, first in enumerate(candidates):
        for second in candidates[index + 1:]:
            size_ratio = min(first["area"], second["area"]) / max(first["area"], second["area"])
            hue_gap = abs((first["hue"] - second["hue"] + 180) % 360 - 180)
            height = max(first["box"][2] - first["box"][0], second["box"][2] - second["box"][0])
            level = abs(first["centre"][0] - second["centre"][0]) / height
            if size_ratio < settings["pair_size_ratio_min"] or hue_gap > settings["hue_tolerance_deg"] or level > 1.0:
                continue
            score = size_ratio * (first["area"] + second["area"])
            if score > best_score:
                best, best_score = (first, second), score
    if best is None:
        raise NoEyesFound("No pair of eyes found on the TRELLIS input image")
    visible, other = sorted(best, key=lambda blob: -blob["area"])
    return visible, other


def cut_decal(rgba: np.ndarray, visible: dict, other: dict, settings: dict) -> dict:
    """Decal of the visible eye: iris and pupil colours, and a mask that adds its outline."""
    top, left, bottom, right = visible["box"]
    width, height = right - left, bottom - top
    outline = max(1, round(settings["outline_ratio"] * max(width, height)))
    pad = outline + 2
    top, left = max(top - pad, 0), max(left - pad, 0)
    bottom, right = min(bottom + pad, rgba.shape[0]), min(right + pad, rgba.shape[1])
    mask = np.zeros((bottom - top, right - left), dtype=bool)
    mask[visible["cells"][:, 0] - top, visible["cells"][:, 1] - left] = True
    eye = fill_holes(mask)
    with_outline = dilate(eye, outline)
    crop = rgba[top:bottom, left:right, :3]
    hue, saturation, value = hsv(crop[eye])
    figure_rows = np.nonzero((rgba[..., 3] > 0.5).any(axis=1))[0]
    return {
        "height_to_figure": height / float(figure_rows[-1] - figure_rows[0] + 1),
        "rgb": crop,
        "alpha": with_outline.astype(np.float32),
        "iris": eye.astype(np.float32),
        "origin": (top, left),
        "centre": visible["centre"],
        "half_size": (width / 2.0, height / 2.0),
        "outward": 1.0 if visible["centre"][1] > other["centre"][1] else -1.0,
        "aspect": width / height,
        "signature": ColorSignature(hue=visible["hue"], saturation=float(np.median(saturation)), value=float(np.median(value))),
        "sizes_px": [[int(visible["box"][3] - visible["box"][1]), int(visible["box"][2] - visible["box"][0])],
                     [int(other["box"][3] - other["box"][1]), int(other["box"][2] - other["box"][0])]],
    }


def visible_eye_decal(path: str, settings: dict) -> dict:
    rgba = load_rgba(path)
    visible, other = best_pair(eye_candidates(rgba, settings), settings)
    return cut_decal(rgba, visible, other, settings)
