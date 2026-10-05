import numpy as np

SAMPLES_PER_CELL = 2.0


def triangle_corners(surface):
    triangles = []
    for face in surface.faces:
        points = [vertex.co[:] for vertex in face.verts]
        triangles.extend([points[0], points[index], points[index + 1]] for index in range(1, len(points) - 1))
    return np.asarray(triangles, dtype=np.float64)


def triangle_samples(corners, spacing):
    longest = max(np.linalg.norm(corners[1] - corners[0]), np.linalg.norm(corners[2] - corners[1]), np.linalg.norm(corners[0] - corners[2]))
    steps = max(1, int(np.ceil(longest / spacing)))
    weights = [(i / steps, j / steps) for i in range(steps + 1) for j in range(steps + 1 - i)]
    first, second = np.asarray(weights).T
    return corners[0] + np.outer(first, corners[1] - corners[0]) + np.outer(second, corners[2] - corners[0])


def shell_voxels(corners, low, shape, cell):
    shell = np.zeros(shape, dtype=bool)
    for triangle in corners:
        indices = np.floor((triangle_samples(triangle, cell / SAMPLES_PER_CELL) - low) / cell).astype(int)
        indices = np.clip(indices, 0, np.asarray(shape) - 1)
        shell[indices[:, 0], indices[:, 1], indices[:, 2]] = True
    return shell


def neighbours(mask):
    grown = mask.copy()
    for axis in range(3):
        for step in (-1, 1):
            grown |= np.roll(mask, step, axis=axis)
    return grown


def exterior_voxels(shell):
    padded = np.pad(shell, 1)
    outside = np.zeros_like(padded)
    outside[0, 0, 0] = True
    while True:
        grown = neighbours(outside) & ~padded
        if (grown == outside).all():
            return outside[1:-1, 1:-1, 1:-1]
        outside = grown


def voxel_occupancy(surface, cell):
    low = np.asarray([min(vertex.co[axis] for vertex in surface.verts) for axis in range(3)])
    high = np.asarray([max(vertex.co[axis] for vertex in surface.verts) for axis in range(3)])
    shape = np.maximum(1, np.ceil((high - low) / cell)).astype(int)
    sealed = neighbours(shell_voxels(triangle_corners(surface), low, shape, cell))
    return ~neighbours(exterior_voxels(sealed)), list(low)
