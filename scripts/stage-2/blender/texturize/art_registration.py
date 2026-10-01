from math import cos, radians, sin

import numpy

INITIAL_STEPS = numpy.array([4.0, 4.0, 0.04, 0.03, 0.03, 0.12])
STEP_ROUNDS = 7
OUTSIDE_PENALTY = 1.0
ALPHA_THRESHOLD = 0.5


def basis(azimuth, elevation):
    towards = numpy.array([sin(radians(azimuth)) * cos(radians(elevation)), -cos(radians(azimuth)) * cos(radians(elevation)), sin(radians(elevation))])
    right = numpy.cross(-towards, [0.0, 0.0, 1.0])
    right = right / numpy.linalg.norm(right)
    up = numpy.cross(right, -towards)
    return towards, right, up / numpy.linalg.norm(up)


class ArtMapping:
    def __init__(self, positions, box, size, reach):
        self.box = box
        self.size = size
        self.centre = positions.mean(axis=0)
        self.reach = reach
        self.initial_bounds = None

    def planar(self, parameters, positions):
        towards, right, up = basis(parameters[0], parameters[1])
        offsets = positions - self.centre
        perspective = 1.0 + parameters[5] * (offsets @ towards) / self.reach
        return numpy.stack([offsets @ right, offsets @ up], axis=1) / perspective[:, None]

    def fix_bounds(self, parameters, positions):
        planar = self.planar(parameters, positions)
        self.initial_bounds = (planar.min(axis=0), planar.max(axis=0))

    def pixels(self, parameters, positions):
        low, high = self.initial_bounds
        unit = (self.planar(parameters, positions) - low) / (high - low)
        row_start, row_end, column_start, column_end = self.box
        columns = column_start + (unit[:, 0] * parameters[2] + parameters[3]) * (column_end - column_start)
        rows = row_start + (unit[:, 1] * parameters[2] + parameters[4]) * (row_end - row_start)
        return columns, rows


def sample_bilinear(pixels, columns, rows):
    height, width = pixels.shape[:2]
    inside = (columns >= 0) & (columns < width - 1) & (rows >= 0) & (rows < height - 1)
    columns = numpy.clip(columns, 0, width - 1.001)
    rows = numpy.clip(rows, 0, height - 1.001)
    column0, row0 = columns.astype(int), rows.astype(int)
    fraction_c, fraction_r = (columns - column0)[:, None], (rows - row0)[:, None]
    top = pixels[row0, column0] * (1 - fraction_c) + pixels[row0, column0 + 1] * fraction_c
    bottom = pixels[row0 + 1, column0] * (1 - fraction_c) + pixels[row0 + 1, column0 + 1] * fraction_c
    return top * (1 - fraction_r) + bottom * fraction_r, inside


def disagreement(mapping, art_pixels, samples, reference, parameters):
    columns, rows = mapping.pixels(parameters, samples)
    colours, inside = sample_bilinear(art_pixels, columns, rows)
    solid = inside & (colours[:, 3] > ALPHA_THRESHOLD)
    difference = ((colours[:, :3] - reference) ** 2).sum(axis=1)
    return numpy.where(solid, difference, OUTSIDE_PENALTY).mean()


def refine(mapping, art_pixels, samples, reference, start):
    best = numpy.array(start, dtype=float)
    best_cost = disagreement(mapping, art_pixels, samples, reference, best)
    steps = INITIAL_STEPS.copy()
    for _ in range(STEP_ROUNDS):
        for axis in range(len(best)):
            for direction in (-1.0, 1.0):
                candidate = best.copy()
                candidate[axis] += direction * steps[axis]
                cost = disagreement(mapping, art_pixels, samples, reference, candidate)
                if cost < best_cost:
                    best, best_cost = candidate, cost
        steps = steps / 2
    return best, best_cost
