from math import cos, radians, sin

import numpy
from mathutils import Vector

GRID = 96
COARSE_AZIMUTH_STEP = 10
COARSE_ELEVATIONS = range(-10, 51, 10)
FINE_RANGE = 6
FINE_STEP = 2
ALPHA_THRESHOLD = 0.5
ASPECT_WEIGHT = 0.3


def view_basis(azimuth, elevation):
    towards = Vector((sin(radians(azimuth)) * cos(radians(elevation)), -cos(radians(azimuth)) * cos(radians(elevation)), sin(radians(elevation))))
    forward = -towards
    right = forward.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(forward).normalized()
    return towards, right, up


def art_mask(pixels):
    solid = pixels[:, :, 3] > ALPHA_THRESHOLD
    rows = numpy.where(solid.any(axis=1))[0]
    columns = numpy.where(solid.any(axis=0))[0]
    return solid, (rows[0], rows[-1] + 1, columns[0], columns[-1] + 1)


def resample(mask, size):
    rows = (numpy.arange(size) + 0.5) * mask.shape[0] / size
    columns = (numpy.arange(size) + 0.5) * mask.shape[1] / size
    return mask[rows.astype(int)[:, None], columns.astype(int)[None, :]]


def project(points, right, up):
    return numpy.array([[point.dot(right), point.dot(up)] for point in points])


def bounds_of(projected):
    return projected.min(axis=0), projected.max(axis=0)


def edge_sign(first, second, points):
    return (second[:, 0] - first[:, 0])[:, None] * (points[None, :, 1] - first[:, 1][:, None]) - (second[:, 1] - first[:, 1])[:, None] * (points[None, :, 0] - first[:, 0][:, None])


def silhouette(projected, triangles):
    low, high = bounds_of(projected)
    normalised = (projected - low) / (high - low)
    centres = (numpy.arange(GRID) + 0.5) / GRID
    columns, rows = numpy.meshgrid(centres, centres)
    points = numpy.stack([columns.ravel(), rows.ravel()], axis=1).astype(numpy.float32)
    corners = normalised[triangles].astype(numpy.float32)
    signs = [edge_sign(corners[:, index], corners[:, (index + 1) % 3], points) for index in range(3)]
    inside = ((signs[0] >= 0) & (signs[1] >= 0) & (signs[2] >= 0)) | ((signs[0] <= 0) & (signs[1] <= 0) & (signs[2] <= 0))
    return inside.any(axis=0).reshape(GRID, GRID), (high - low)


def overlap_score(mask, extent, reference, reference_aspect):
    union = numpy.logical_or(mask, reference).sum()
    intersection = numpy.logical_and(mask, reference).sum()
    aspect = abs(numpy.log((extent[0] / extent[1]) / reference_aspect))
    return intersection / union - ASPECT_WEIGHT * aspect


class CameraFit:
    def __init__(self, points, triangles, pixels):
        self.points = points
        self.triangles = triangles
        solid, box = art_mask(pixels)
        self.box = box
        rows, columns = box[1] - box[0], box[3] - box[2]
        self.reference = resample(solid[box[0] : box[1], box[2] : box[3]], GRID)
        self.reference_aspect = columns / rows

    def score(self, azimuth, elevation):
        _, right, up = view_basis(azimuth, elevation)
        mask, extent = silhouette(project(self.points, right, up), self.triangles)
        return overlap_score(mask, extent, self.reference, self.reference_aspect)

    def best(self, azimuths, elevations):
        candidates = [(azimuth, elevation) for azimuth in azimuths for elevation in elevations]
        return max(candidates, key=lambda candidate: self.score(*candidate))

    def fit(self):
        azimuth, elevation = self.best(range(0, 360, COARSE_AZIMUTH_STEP), COARSE_ELEVATIONS)
        fine_azimuths = range(azimuth - FINE_RANGE, azimuth + FINE_RANGE + 1, FINE_STEP)
        fine_elevations = range(elevation - FINE_RANGE, elevation + FINE_RANGE + 1, FINE_STEP)
        azimuth, elevation = self.best(fine_azimuths, fine_elevations)
        return azimuth, elevation, self.score(azimuth, elevation)
