from collections import deque

import numpy as np

FILL_THRESHOLD = 0.5


def cell_indices(planes, low, cell, count, axis):
    centres = low[axis] + (np.arange(count) + 0.5) * cell
    inner = np.asarray(planes[axis][1:-1])
    return np.searchsorted(inner, centres)


def cell_fractions(grid, planes, low, cell):
    indices = [cell_indices(planes, low, cell, grid.shape[axis], axis) for axis in range(3)]
    shape = [len(planes[axis]) - 1 for axis in range(3)]
    inside = np.zeros(shape)
    total = np.zeros(shape)
    mesh = np.meshgrid(*indices, indexing="ij")
    np.add.at(inside, tuple(mesh), grid)
    np.add.at(total, tuple(mesh), 1)
    return np.divide(inside, total, out=np.zeros(shape), where=total > 0)


def largest_component(occupied):
    seen = np.zeros_like(occupied)
    best = []
    for start in map(tuple, np.argwhere(occupied)):
        if seen[start]:
            continue
        seen[start] = True
        component, queue = [], deque([start])
        while queue:
            current = queue.popleft()
            component.append(current)
            for axis in range(3):
                for step in (-1, 1):
                    neighbour = list(current)
                    neighbour[axis] += step
                    neighbour = tuple(neighbour)
                    inside = all(0 <= neighbour[a] < occupied.shape[a] for a in range(3))
                    if inside and occupied[neighbour] and not seen[neighbour]:
                        seen[neighbour] = True
                        queue.append(neighbour)
        best = max(best, component, key=len)
    result = np.zeros_like(occupied)
    for index in best:
        result[index] = True
    return result


def pinched_cells(occupied, axis):
    padded = np.pad(occupied, 1)
    first, second = [a for a in range(3) if a != axis]
    def shifted(step_first, step_second):
        window = [slice(1, -1)] * 3
        window[first] = slice(1 + step_first, padded.shape[first] - 1 + step_first)
        window[second] = slice(1 + step_second, padded.shape[second] - 1 + step_second)
        return padded[tuple(window)]
    a, b, c, d = shifted(0, 0), shifted(1, 1), shifted(1, 0), shifted(0, 1)
    return (a & b & ~c & ~d) | (c & d & ~a & ~b)


def seal_pinches(occupied):
    for _ in range(8):
        filled = False
        for axis in range(3):
            pinch = pinched_cells(occupied, axis)
            if pinch.any():
                filled = True
                occupied = occupied | grow_into_pinch(occupied, pinch, axis)
        if not filled:
            break
    return occupied


def grow_into_pinch(occupied, pinch, axis):
    first, second = [a for a in range(3) if a != axis]
    grown = np.zeros_like(occupied)
    for step_first in (0, 1):
        for step_second in (0, 1):
            grown |= np.roll(np.roll(pinch, step_first, first), step_second, second)
    return grown


def occupied_cells(grid, planes, low, cell):
    fractions = cell_fractions(grid, planes, low, cell)
    occupied = largest_component(fractions >= FILL_THRESHOLD)
    return seal_pinches(occupied)
