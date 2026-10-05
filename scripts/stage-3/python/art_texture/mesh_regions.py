import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

VERTICAL = np.array([0.0, 0.0, 1.0])
NORTH = np.array([0.0, 1.0, 0.0])
PLANE_TOLERANCE_RATIO = 1e-3
NORMAL_DECIMALS = 2
TOP_LIMIT = 0.95


@dataclass(frozen=True)
class PlaneRegion:
    index: int
    normal: np.ndarray
    offset: float
    face_ids: tuple
    u_axis: np.ndarray
    v_axis: np.ndarray
    bounds: tuple

    @property
    def width(self):
        return self.bounds[1] - self.bounds[0]

    @property
    def height(self):
        return self.bounds[3] - self.bounds[2]

    def to_plane(self, points):
        return np.stack([points @ self.u_axis, points @ self.v_axis], axis=1)

    def from_plane(self, coordinates):
        origin = self.normal * self.offset
        return origin + np.outer(coordinates[:, 0], self.u_axis) + np.outer(coordinates[:, 1], self.v_axis)

    def corners(self):
        u0, u1, v0, v1 = self.bounds
        return self.from_plane(np.array([[u0, v1], [u1, v1], [u1, v0], [u0, v0]]))


@dataclass(frozen=True)
class MeshDocument:
    vertices: np.ndarray
    faces: tuple
    length: float
    ground_offset: np.ndarray


def load_mesh(path):
    document = json.loads(Path(path).read_text())
    vertices = np.array([vertex["position"] for vertex in document["vertices"]], dtype=np.float64)
    offset = np.array(document.get("groundOffset", (0, 0, 0)), dtype=np.float64)
    return MeshDocument(vertices, tuple(tuple(face) for face in document["faces"]), document["lengthMeters"], offset)


def face_normal(vertices, face):
    points = vertices[list(face)]
    total = np.zeros(3)
    for index in range(len(points)):
        total += np.cross(points[index], points[(index + 1) % len(points)])
    return total / np.linalg.norm(total)


def plane_axes(normal):
    up = NORTH if abs(normal @ VERTICAL) > TOP_LIMIT else VERTICAL
    u_axis = np.cross(up, normal)
    return u_axis / np.linalg.norm(u_axis), up


def plane_key(normal, offset, tolerance):
    return tuple(np.round(normal, NORMAL_DECIMALS)), round(offset / tolerance)


def connected_groups(faces, keys):
    owners = {}
    groups = {}
    for index, face in enumerate(faces):
        groups[index] = {index}
        for corner in range(len(face)):
            edge = frozenset((face[corner], face[(corner + 1) % len(face)]))
            other = owners.setdefault((keys[index], edge), index)
            if other != index and groups[other] is not groups[index]:
                merged = groups[other] | groups[index]
                for member in merged:
                    groups[member] = merged
    return {id(group): sorted(group) for group in groups.values()}.values()


def region_of(mesh, index, face_ids):
    normal = face_normal(mesh.vertices, mesh.faces[face_ids[0]])
    points = mesh.vertices[sorted({vertex for face in face_ids for vertex in mesh.faces[face]})]
    offset = float(np.mean(points @ normal))
    u_axis, v_axis = plane_axes(normal)
    coordinates = np.stack([points @ u_axis, points @ v_axis], axis=1)
    bounds = (coordinates[:, 0].min(), coordinates[:, 0].max(), coordinates[:, 1].min(), coordinates[:, 1].max())
    return PlaneRegion(index, normal, offset, tuple(face_ids), u_axis, v_axis, bounds)


def plane_regions(mesh):
    tolerance = PLANE_TOLERANCE_RATIO * mesh.length
    keys = []
    for face in mesh.faces:
        normal = face_normal(mesh.vertices, face)
        keys.append(plane_key(normal, float(mesh.vertices[face[0]] @ normal), tolerance))
    return [region_of(mesh, index, tuple(group)) for index, group in enumerate(connected_groups(mesh.faces, keys))]


ALIGNED_NORMAL = 0.97


def aligned_area_ratio(mesh):
    normals, areas = [], []
    for face in mesh.faces:
        points = mesh.vertices[list(face)]
        cross = sum(np.cross(points[index], points[(index + 1) % len(points)]) for index in range(len(points)))
        areas.append(np.linalg.norm(cross) / 2)
        normals.append(cross / np.linalg.norm(cross))
    normals, areas = np.array(normals), np.array(areas)
    side = np.abs(normals[:, 2]) < 0.5
    angles = np.arctan2(normals[side, 1], normals[side, 0])
    yaw = np.arctan2((areas[side] * np.sin(4 * angles)).sum(), (areas[side] * np.cos(4 * angles)).sum()) / 4
    cosine, sine = np.cos(-yaw), np.sin(-yaw)
    rotated = np.stack([normals[:, 0] * cosine - normals[:, 1] * sine, normals[:, 0] * sine + normals[:, 1] * cosine, normals[:, 2]], axis=1)
    aligned = np.abs(rotated).max(axis=1) >= ALIGNED_NORMAL
    return float(areas[aligned].sum() / areas.sum())


def face_geometry(mesh):
    normals, areas = [], []
    for face in mesh.faces:
        points = mesh.vertices[list(face)]
        cross = sum(np.cross(points[index], points[(index + 1) % len(points)]) for index in range(len(points)))
        areas.append(np.linalg.norm(cross) / 2)
        normals.append(cross / np.linalg.norm(cross))
    return np.array(normals), np.array(areas)


def face_neighbours(mesh):
    owners, neighbours = {}, [set() for _ in mesh.faces]
    for index, face in enumerate(mesh.faces):
        for corner in range(len(face)):
            edge = frozenset((face[corner], face[(corner + 1) % len(face)]))
            for other in owners.setdefault(edge, []):
                neighbours[index].add(other)
                neighbours[other].add(index)
            owners[edge].append(index)
    return neighbours


def grows_into(mesh, normals, seed, candidate, limits):
    if float(normals[seed] @ normals[candidate]) < limits["cosine"]:
        return False
    deviation = np.abs((mesh.vertices[list(mesh.faces[candidate])] - mesh.vertices[mesh.faces[seed][0]]) @ normals[seed]).max()
    return bool(deviation <= limits["deviation"])


def grow_group(mesh, normals, neighbours, seed, assigned, limits):
    group, frontier = [seed], [seed]
    assigned[seed] = True
    while frontier:
        for candidate in sorted(neighbours[frontier.pop()]):
            if assigned[candidate] or not grows_into(mesh, normals, seed, candidate, limits):
                continue
            trial = group + [candidate]
            if extent_of(mesh, trial, normals[seed]) > limits["extent"]:
                continue
            assigned[candidate] = True
            group.append(candidate)
            frontier.append(candidate)
    return group


def extent_of(mesh, faces, normal):
    points = mesh.vertices[sorted({vertex for face in faces for vertex in mesh.faces[face]})]
    u_axis, v_axis = plane_axes(normal)
    return max(np.ptp(points @ u_axis), np.ptp(points @ v_axis))


def fitted_region(mesh, index, faces, normals, areas):
    mean = (normals[faces] * areas[faces, None]).sum(axis=0)
    normal = mean / np.linalg.norm(mean)
    points = mesh.vertices[sorted({vertex for face in faces for vertex in mesh.faces[face]})]
    u_axis, v_axis = plane_axes(normal)
    coordinates = np.stack([points @ u_axis, points @ v_axis], axis=1)
    bounds = (coordinates[:, 0].min(), coordinates[:, 0].max(), coordinates[:, 1].min(), coordinates[:, 1].max())
    return PlaneRegion(index, normal, float(np.mean(points @ normal)), tuple(faces), u_axis, v_axis, bounds)


def grouped_regions(mesh, angle_degrees, deviation_ratio, extent_ratio):
    normals, areas = face_geometry(mesh)
    neighbours = face_neighbours(mesh)
    limits = {"cosine": np.cos(np.radians(angle_degrees)), "deviation": deviation_ratio * mesh.length, "extent": extent_ratio * mesh.length}
    assigned = np.zeros(len(mesh.faces), dtype=bool)
    groups = []
    for seed in np.argsort(-areas):
        if not assigned[seed]:
            groups.append(grow_group(mesh, normals, neighbours, int(seed), assigned, limits))
    return [fitted_region(mesh, index, faces, normals, areas) for index, faces in enumerate(groups)]
