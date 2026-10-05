from dataclasses import dataclass

import cv2
import numpy as np

from camera import Camera

WORKING_SIZE = 243
COARSE_AZIMUTHS = np.deg2rad(np.arange(0, 360, 15))
COARSE_ELEVATIONS = np.deg2rad([15, 30, 45])
COARSE_STEPS = 120
REFINE_STEPS = 700
KEPT_CANDIDATES = 8
DISTINCT_AZIMUTH = np.deg2rad(25)
SLAB_THICKNESS_RATIO = 0.04
SLAB_MARGIN_RATIO = 1.3


@dataclass(frozen=True)
class Slab:
    centre_x: float
    centre_y: float
    half_x: float
    half_y: float
    thickness: float

    def polygons(self):
        x0, x1 = self.centre_x - self.half_x, self.centre_x + self.half_x
        y0, y1 = self.centre_y - self.half_y, self.centre_y + self.half_y
        z0, z1 = -self.thickness, 0.0
        corners = np.array([[x, y, z] for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)])
        quads = [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)]
        return [corners[list(quad)] for quad in quads]


@dataclass(frozen=True)
class Registration:
    iou: float
    camera: Camera
    slab: Slab


def target_mask(alpha):
    resized = cv2.resize(alpha, (WORKING_SIZE, WORKING_SIZE), interpolation=cv2.INTER_AREA)
    return resized > 127


def figure_polygons(mesh):
    return [mesh.vertices[list(face)] for face in mesh.faces]


def render_mask(camera, polygons):
    working = camera.with_values(
        scale=camera.scale * WORKING_SIZE / camera.image_size,
        shift_x=camera.shift_x * WORKING_SIZE / camera.image_size,
        shift_y=camera.shift_y * WORKING_SIZE / camera.image_size,
        image_size=WORKING_SIZE,
    )
    canvas = np.zeros((WORKING_SIZE, WORKING_SIZE), dtype=np.uint8)
    for polygon in polygons:
        cv2.fillConvexPoly(canvas, np.round(working.project(polygon)).astype(np.int32), 1)
    return canvas > 0


def overlap_ratio(rendered, target):
    union = np.logical_or(rendered, target).sum()
    return float(np.logical_and(rendered, target).sum() / union) if union else 0.0


def vector_to_state(vector, base_camera):
    camera = base_camera.with_values(
        azimuth=vector[0], elevation=vector[1], scale=vector[2],
        shift_x=vector[3], shift_y=vector[4], depth_inverse=vector[5],
    )
    return camera, Slab(*vector[6:11])


def score(vector, base_camera, figure, target):
    camera, slab = vector_to_state(vector, base_camera)
    return overlap_ratio(render_mask(camera, figure + slab.polygons()), target)


def initial_vector(mesh, base_camera, azimuth, elevation, target):
    camera = base_camera.with_values(azimuth=azimuth, elevation=elevation, scale=1.0, shift_x=0.0, shift_y=0.0)
    projected = camera.project(mesh.vertices)
    span = projected.max(axis=0) - projected.min(axis=0)
    rows, columns = np.nonzero(target)
    target_span = np.array([np.ptp(columns), np.ptp(rows)]) * base_camera.image_size / WORKING_SIZE
    scale = 0.9 * float(np.min(target_span / span))
    half = mesh.vertices.max(axis=0) - mesh.vertices.min(axis=0)
    centre = (mesh.vertices.max(axis=0) + mesh.vertices.min(axis=0)) / 2
    return np.array([azimuth, elevation, scale, 0.0, 0.0, 0.0, centre[0], centre[1],
                     half[0] * SLAB_MARGIN_RATIO / 2, half[1] * SLAB_MARGIN_RATIO / 2, SLAB_THICKNESS_RATIO * mesh.length])


def step_sizes(mesh, vector):
    return np.array([0.05, 0.05, vector[2] * 0.03, 6.0, 6.0, 0.15, mesh.length * 0.03,
                     mesh.length * 0.03, mesh.length * 0.04, mesh.length * 0.04, mesh.length * 0.01])


def refine(vector, steps, evaluate, sizes, generator):
    best, best_score = vector.copy(), evaluate(vector)
    for iteration in range(steps):
        cooling = 1.0 - iteration / steps * 0.9
        candidate = best + generator.normal(size=len(best)) * sizes * cooling * (generator.random(len(best)) < 0.4)
        candidate_score = evaluate(candidate)
        if candidate_score > best_score:
            best, best_score = candidate, candidate_score
    return best, best_score


def distinct(candidates):
    kept = []
    for vector, value in sorted(candidates, key=lambda item: -item[1]):
        if all(abs(np.angle(np.exp(1j * (vector[0] - other[0])))) > DISTINCT_AZIMUTH for other, _ in kept):
            kept.append((vector, value))
    return kept[:KEPT_CANDIDATES]


def fit_silhouette(mesh, alpha, image_size):
    base = Camera(0.0, 0.0, 1.0, 0.0, 0.0, 0.0, (mesh.vertices.max(axis=0) + mesh.vertices.min(axis=0)) / 2, image_size)
    target = target_mask(alpha)
    figure = figure_polygons(mesh)
    generator = np.random.default_rng(7)
    evaluate = lambda vector: score(vector, base, figure, target)
    coarse = []
    for azimuth in COARSE_AZIMUTHS:
        for elevation in COARSE_ELEVATIONS:
            start = initial_vector(mesh, base, azimuth, elevation, target)
            coarse.append(refine(start, COARSE_STEPS, evaluate, step_sizes(mesh, start), generator))
    refined = [refine(vector, REFINE_STEPS, evaluate, step_sizes(mesh, vector), generator) for vector, _ in distinct(coarse)]
    return [Registration(value, *vector_to_state(vector, base)) for vector, value in distinct(refined)]
