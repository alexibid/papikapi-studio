"""Solid volume that tolerates holes: vertical columns are cast through the outer surface and the lengths inside are
summed. A column that crosses an odd number of walls went through a hole; it takes the value of its neighbours."""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MAX_HITS = 64
STEP_RATIO = 1e-6


def column_hits(tree, x, y, floor, step):
    hits, origin = [], Vector((x, y, floor))
    for _ in range(MAX_HITS):
        location = tree.ray_cast(origin, Vector((0.0, 0.0, 1.0)))[0]
        if location is None:
            return hits
        hits.append(location.z)
        origin = Vector((x, y, location.z + step))
    return hits


def inside_length(hits):
    if len(hits) % 2:
        return None
    return sum(hits[index + 1] - hits[index] for index in range(0, len(hits), 2))


def fill_from_neighbours(lengths, known):
    """Grows the known columns into the unknown ones, ring by ring, so a large hole is filled from its rim."""
    filled, known = lengths.copy(), known.copy()
    while not known.all():
        total = np.zeros_like(filled)
        count = np.zeros_like(filled)
        padded_values = np.pad(np.where(known, filled, 0.0), 1)
        padded_known = np.pad(known.astype(float), 1)
        for dy in range(3):
            for dx in range(3):
                total += padded_values[dy:dy + filled.shape[0], dx:dx + filled.shape[1]]
                count += padded_known[dy:dy + filled.shape[0], dx:dx + filled.shape[1]]
        ready = ~known & (count > 0)
        if not ready.any():
            break
        filled[ready] = total[ready] / count[ready]
        known |= ready
    return filled


def column_volume(surface, resolution):
    """Volume of the solid bounded by an outer surface (single wall), with resolution x resolution columns."""
    tree = BVHTree.FromBMesh(surface)
    low = [min(v.co[axis] for v in surface.verts) for axis in range(3)]
    high = [max(v.co[axis] for v in surface.verts) for axis in range(3)]
    size_x, size_y = (high[0] - low[0]) / resolution, (high[1] - low[1]) / resolution
    floor, step = low[2] - 1.0, (high[2] - low[2]) * STEP_RATIO
    lengths = np.zeros((resolution, resolution))
    known = np.zeros((resolution, resolution), dtype=bool)
    for row in range(resolution):
        for col in range(resolution):
            length = inside_length(column_hits(tree, low[0] + (col + 0.5) * size_x, low[1] + (row + 0.5) * size_y,
                                               floor, step))
            known[row, col] = length is not None
            lengths[row, col] = length or 0.0
    filled = fill_from_neighbours(lengths, known)
    return float(filled.sum() * size_x * size_y), float(1.0 - known.mean())
