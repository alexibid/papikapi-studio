from dataclasses import dataclass

import cv2
import numpy as np

INNER_MARGIN = 0.22
MIN_VISIBLE_SHARE = 0.5
PURE_STD_LIMIT = 6.5


@dataclass(frozen=True)
class CellGrid:
    columns: int
    rows: int
    lab: np.ndarray
    sampled: np.ndarray
    pure: np.ndarray
    member: np.ndarray


def to_lab(patch):
    return cv2.cvtColor(patch.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def cell_slices(grid_shape, size, row, column):
    height, width = size[1], size[0]
    cell_height, cell_width = height / grid_shape[0], width / grid_shape[1]
    margin_y, margin_x = cell_height * INNER_MARGIN, cell_width * INNER_MARGIN
    rows = slice(int(round(row * cell_height + margin_y)), int(round((row + 1) * cell_height - margin_y)))
    columns = slice(int(round(column * cell_width + margin_x)), int(round((column + 1) * cell_width - margin_x)))
    return rows, columns


def sample_cells(region, patch, cell_size):
    columns, rows = max(1, round(region.width / cell_size)), max(1, round(region.height / cell_size))
    lab = to_lab(patch.colour)
    size = (patch.colour.shape[1], patch.colour.shape[0])
    values = np.zeros((rows, columns, 3), dtype=np.float32)
    sampled = np.zeros((rows, columns), dtype=bool)
    pure = np.zeros((rows, columns), dtype=bool)
    member = np.zeros((rows, columns), dtype=bool)
    for row in range(rows):
        for column in range(columns):
            window = cell_slices((rows, columns), size, row, column)
            visible = patch.visible[window]
            member[row, column] = patch.coverage[window].mean() >= MIN_VISIBLE_SHARE
            if visible.mean() < MIN_VISIBLE_SHARE:
                continue
            pixels = lab[window][visible]
            values[row, column] = np.median(pixels, axis=0)
            sampled[row, column] = True
            pure[row, column] = float(pixels.std(axis=0).mean()) < PURE_STD_LIMIT
    return CellGrid(columns, rows, values, sampled, pure, member)
