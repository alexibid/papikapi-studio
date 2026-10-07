from math import ceil

import numpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MAX_CROSSINGS = 64
PADDING_CELLS = 4


class VoxelGrid:
    def __init__(self, surface, cell):
        low = Vector(map(min, zip(*[vertex.co for vertex in surface.verts])))
        high = Vector(map(max, zip(*[vertex.co for vertex in surface.verts])))
        self.cell = cell
        self.origin = low - Vector((PADDING_CELLS * cell,) * 3)
        self.shape = tuple(ceil((high[axis] - low[axis]) / cell) + 2 * PADDING_CELLS for axis in range(3))

    def index_of(self, point):
        raw = [int((point[axis] - self.origin[axis]) / self.cell) for axis in range(3)]
        return tuple(min(max(raw[axis], 0), self.shape[axis] - 1) for axis in range(3))

    def centre_of(self, column, row):
        return self.origin.x + (column + 0.5) * self.cell, self.origin.y + (row + 0.5) * self.cell


def column_crossings(tree, x, y, floor, step):
    crossings, height = [], floor
    for _ in range(MAX_CROSSINGS):
        hit = tree.ray_cast(Vector((x, y, height)), Vector((0, 0, 1)))
        if hit[0] is None:
            break
        crossings.append(hit[0].z)
        height = hit[0].z + step
    return crossings


def solid_voxels(surface, grid):
    tree = BVHTree.FromBMesh(surface)
    solid = numpy.zeros(grid.shape, dtype=bool)
    for column in range(grid.shape[0]):
        for row in range(grid.shape[1]):
            x, y = grid.centre_of(column, row)
            crossings = column_crossings(tree, x, y, grid.origin.z, grid.cell * 1e-3)
            if len(crossings) % 2:
                continue
            for entry, exit_ in zip(crossings[0::2], crossings[1::2]):
                first = int((entry - grid.origin.z) / grid.cell + 0.5)
                last = int((exit_ - grid.origin.z) / grid.cell + 0.5)
                solid[column, row, first:last] = True
    return solid


def erode(mask):
    result = mask.copy()
    for axis in range(3):
        forward, backward = [slice(None)] * 3, [slice(None)] * 3
        forward[axis], backward[axis] = slice(1, None), slice(None, -1)
        result[tuple(forward)] &= mask[tuple(backward)]
        result[tuple(backward)] &= mask[tuple(forward)]
    return result


def dilate(mask):
    result = mask.copy()
    for axis in range(3):
        forward, backward = [slice(None)] * 3, [slice(None)] * 3
        forward[axis], backward[axis] = slice(1, None), slice(None, -1)
        result[tuple(forward)] |= mask[tuple(backward)]
        result[tuple(backward)] |= mask[tuple(forward)]
    return result


def repeated(operation, mask, times):
    for _ in range(times):
        mask = operation(mask)
    return mask


def body_zone(solid, radius_cells, tolerance_cells):
    opened = repeated(dilate, repeated(erode, solid, radius_cells), radius_cells)
    return repeated(dilate, opened, tolerance_cells)


def lies_outside(face, zone, grid):
    points = [face.calc_center_median()] + [vertex.co for vertex in face.verts]
    return not any(zone[grid.index_of(point)] for point in points)


def faces_outside_body(surface, length, settings):
    to_mm = settings["target_size_mm"] / length
    grid = VoxelGrid(surface, settings["envelope_cell_mm"] / to_mm)
    radius = round(settings["min_feature_mm"] / 2 / settings["envelope_cell_mm"])
    tolerance = round(settings["envelope_tolerance_mm"] / settings["envelope_cell_mm"])
    solid = solid_voxels(surface, grid)
    if not solid.any():
        return set()
    zone = body_zone(solid, radius, tolerance)
    return {face for face in surface.faces if lies_outside(face, zone, grid)}
