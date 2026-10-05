from dataclasses import dataclass, field

import cv2
import numpy as np
from scipy import ndimage

from palette import build_palette, nearest_index, snap_to_palette
from pixel_grid import CellGrid, sample_cells
from smooth_objects import SmoothShape, object_components, vectorize_component

TRELLIS_LIGHTNESS_WEIGHT = 0.35


@dataclass
class RegionTexture:
    region: object
    grid: CellGrid
    indices: np.ndarray
    resolved: np.ndarray
    size: tuple
    shapes: list = field(default_factory=list)
    pixel: bool = True
    background: object = None


def head_cell_size(regions, head_cells):
    tops = [region for region in regions if region.normal[2] > 0.9]
    head = max(tops, key=lambda region: region.offset)
    return head.width / head_cells


def snap_grid(grid, palette, weight=1.0):
    indices = snap_to_palette(palette, grid.lab, weight)
    return np.where(grid.sampled, indices, -1)


def fill_from_neighbours(indices, member):
    filled = indices.copy()
    for _ in range(max(indices.shape)):
        missing = (filled < 0) & member
        if not missing.any():
            break
        for row, column in np.argwhere(missing):
            around = filled[max(row - 1, 0):row + 2, max(column - 1, 0):column + 2].ravel()
            around = around[around >= 0]
            if len(around):
                filled[row, column] = np.bincount(around).argmax()
    return filled


NOISE_COLOUR_DISTANCE = 18.0


def denoise(indices, palette):
    cleaned = indices.copy()
    rows, columns = indices.shape
    for row in range(rows):
        for column in range(columns):
            current = indices[row, column]
            around = [indices[r, c] for r, c in ((row - 1, column), (row + 1, column), (row, column - 1), (row, column + 1))
                      if 0 <= r < rows and 0 <= c < columns and indices[r, c] >= 0]
            if current < 0 or not around or current in around:
                continue
            majority = int(np.bincount(around).argmax())
            if np.linalg.norm(palette[current] - palette[majority]) < NOISE_COLOUR_DISTANCE:
                cleaned[row, column] = majority
    return cleaned


def art_texture(region, patch, cell_size, palette, cell_px):
    grid = sample_cells(region, patch, cell_size)
    indices = denoise(snap_grid(grid, palette), palette)
    shapes = []
    for component in object_components(grid):
        background, found = vectorize_component(patch, component, cell_px)
        if background is not None:
            indices[component] = nearest_index(palette, background)
            shapes.extend(found)
    size = (patch.colour.shape[1], patch.colour.shape[0])
    return RegionTexture(region, grid, indices, indices >= 0, size, shapes)


def trellis_texture(region, patch, cell_size, palette):
    grid = sample_cells(region, patch, cell_size)
    indices = snap_grid(grid, palette, TRELLIS_LIGHTNESS_WEIGHT)
    size = (patch.colour.shape[1], patch.colour.shape[0])
    return RegionTexture(region, grid, indices, indices >= 0, size)


LAYOUT_MERGE_DISTANCE = 14.0


def transferred_texture(region, shape_patch, colour_patch, cell_size, palette, allowed):
    shape = sample_cells(region, shape_patch, cell_size)
    source = sample_cells(region, colour_patch, cell_size)
    groups = snap_to_palette(build_palette(shape.lab[shape.sampled], LAYOUT_MERGE_DISTANCE)[0], shape.lab)
    indices = np.full(shape.sampled.shape, -1)
    for group in np.unique(groups[shape.sampled]):
        cells = (groups == group) & shape.sampled
        known = cells & source.sampled
        colour = np.median(source.lab[known], axis=0) if known.any() else np.median(shape.lab[cells], axis=0)
        indices[cells] = allowed[nearest_index(palette[allowed], colour, TRELLIS_LIGHTNESS_WEIGHT)]
    size = (shape_patch.colour.shape[1], shape_patch.colour.shape[0])
    return RegionTexture(region, shape, indices, indices >= 0, size)
