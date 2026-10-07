"""Counts adjacent face pairs that are nearly coplanar in a reduced mesh (a measure of unmerged flat facets).

Usage: python3 scripts/stage-3/checks/coplanar_pairs.py <reduce.json> [<reduce.json> ...]
"""
import json
import sys
from collections import defaultdict
from math import acos, degrees

import numpy as np


def normal(vertices, face):
    points = vertices[face]
    total = sum(np.cross(points[i] - points[0], points[i + 1] - points[0]) for i in range(1, len(face) - 1))
    return total / (np.linalg.norm(total) or 1)


def report(path, angle_deg=8):
    document = json.load(open(path))
    vertices = np.array([v["position"] for v in document["vertices"]])
    faces = document["faces"]
    normals = [normal(vertices, face) for face in faces]
    owners = defaultdict(list)
    for index, face in enumerate(faces):
        for i in range(len(face)):
            owners[frozenset((face[i], face[(i + 1) % len(face)]))].append(index)
    pairs = [p for p in owners.values() if len(p) == 2]
    flat = [p for p in pairs if degrees(acos(max(-1, min(1, float(normals[p[0]] @ normals[p[1]]))))) <= angle_deg]
    print(f"{path.split('/')[-1]}: {len(faces)} faces, {len(flat)} of {len(pairs)} edges separate faces within {angle_deg} deg")


for argument in sys.argv[1:]:
    report(argument)
