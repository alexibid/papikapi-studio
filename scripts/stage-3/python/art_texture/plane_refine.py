import json
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np

from camera import Camera
from mesh_regions import MeshDocument

CANNY_LOW = 35
CANNY_HIGH = 100
EDGE_BLUR_SIGMA = 1.2
TRUNCATION_PX = 14.0
SAMPLE_SPACING_PX = 3.0
ITERATIONS = 30000
MAX_SHIFT_RATIO = 0.08
SHIFT_PENALTY = 0.1
CAMERA_STEPS = np.array([0.01, 0.01, 0.004, 1.0, 1.0, 0.02])
SHIFT_STEP_RATIO = 0.006


def edge_distance(art):
    gray = cv2.GaussianBlur(cv2.cvtColor(art[:, :, :3], cv2.COLOR_BGR2GRAY), (0, 0), EDGE_BLUR_SIGMA)
    alpha = (art[:, :, 3] > 127).astype(np.uint8)
    outline = cv2.morphologyEx(alpha, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    inside = cv2.erode(alpha, np.ones((5, 5), np.uint8)) > 0
    edges = (cv2.Canny(gray, CANNY_LOW, CANNY_HIGH) > 0) & inside | outline
    return cv2.distanceTransform((~edges).astype(np.uint8), cv2.DIST_L2, 3)


def coordinate_labels(vertices, tolerance):
    labels, values = [], []
    for axis in range(3):
        ordered = np.unique(np.round(vertices[:, axis] / tolerance).astype(np.int64))
        values.append(ordered)
        labels.append(np.searchsorted(ordered, np.round(vertices[:, axis] / tolerance).astype(np.int64)))
    return labels, values


def front_edges(mesh, camera):
    edges = set()
    for face in mesh.faces:
        points = mesh.vertices[list(face)]
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        if camera.faces_viewer(normal):
            edges.update(tuple(sorted((face[i], face[(i + 1) % len(face)]))) for i in range(len(face)))
    return sorted(edges)


def edge_cost(camera, vertices, edges, distance):
    projected = camera.project(vertices)
    total, count = 0.0, 0
    height, width = distance.shape
    for first, second in edges:
        start, end = projected[first], projected[second]
        samples = max(2, int(np.linalg.norm(end - start) / SAMPLE_SPACING_PX))
        points = start + np.outer(np.linspace(0, 1, samples), end - start)
        x = np.clip(np.round(points[:, 0]).astype(int), 0, width - 1)
        y = np.clip(np.round(points[:, 1]).astype(int), 0, height - 1)
        total += np.minimum(distance[y, x], TRUNCATION_PX).sum()
        count += samples
    return total / count


def shifted(vertices, labels, shifts):
    result = vertices.copy()
    for axis in range(3):
        result[:, axis] += shifts[axis][labels[axis]]
    return result


def camera_with(base, vector):
    return base.with_values(azimuth=base.azimuth + vector[0], elevation=base.elevation + vector[1],
                            scale=base.scale * (1 + vector[2]), shift_x=base.shift_x + vector[3],
                            shift_y=base.shift_y + vector[4], depth_inverse=base.depth_inverse + vector[5])


def refine_planes(mesh, camera, art, iterations=ITERATIONS, move_planes=True, seed=11):
    distance = edge_distance(art)
    edges = front_edges(mesh, camera)
    labels, values = coordinate_labels(mesh.vertices, 1e-4 * mesh.length)
    generator = np.random.default_rng(seed)
    limit = MAX_SHIFT_RATIO * mesh.length if move_planes else 0.0
    shifts = [np.zeros(len(value)) for value in values]
    vector = np.zeros(6)

    def evaluate(current_shifts, current_vector):
        vertices = shifted(mesh.vertices, labels, current_shifts)
        penalty = SHIFT_PENALTY * np.mean([np.abs(item).mean() for item in current_shifts]) / mesh.length * 100
        return edge_cost(camera_with(camera, current_vector), vertices, edges, distance) + penalty

    best = evaluate(shifts, vector)
    for iteration in range(iterations):
        cooling = 1.0 - 0.9 * iteration / iterations
        trial_shifts = [item.copy() for item in shifts]
        axis = generator.integers(3)
        index = generator.integers(len(trial_shifts[axis]))
        trial_shifts[axis][index] = np.clip(trial_shifts[axis][index] + generator.normal() * SHIFT_STEP_RATIO * mesh.length * cooling, -limit, limit)
        trial_vector = vector + (generator.normal(size=6) * CAMERA_STEPS * cooling * (generator.random() < 0.3))
        value = evaluate(trial_shifts, trial_vector)
        if value < best:
            best, shifts, vector = value, trial_shifts, trial_vector
    refined = replace(mesh, vertices=shifted(mesh.vertices, labels, shifts))
    return refined, camera_with(camera, vector), best


def write_aligned_mesh(source_path, mesh, target_path):
    document = json.loads(Path(source_path).read_text())
    for record, position in zip(document["vertices"], mesh.vertices):
        record["position"] = [float(value) for value in position]
    Path(target_path).write_text(json.dumps(document, indent=2))
