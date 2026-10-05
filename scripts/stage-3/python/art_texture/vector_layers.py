import cv2
import numpy as np

CELL_RASTER_PX = 24
SUPERSAMPLE = 4


def lab_to_rgb(lab):
    pixel = np.array([[lab]], dtype=np.float32)
    return np.clip(cv2.cvtColor(pixel, cv2.COLOR_LAB2RGB)[0, 0] * 255 + 0.5, 0, 255).astype(np.uint8)


def hex_of(lab):
    return "#%02x%02x%02x" % tuple(lab_to_rgb(lab))


def boundary_edges(mask):
    padded = np.pad(mask, 1)
    edges = {}
    for row in range(mask.shape[0]):
        for column in range(mask.shape[1]):
            if not mask[row, column]:
                continue
            r, c = row + 1, column + 1
            if not padded[r - 1, c]:
                edges.setdefault((column, row), []).append((column + 1, row))
            if not padded[r, c + 1]:
                edges.setdefault((column + 1, row), []).append((column + 1, row + 1))
            if not padded[r + 1, c]:
                edges.setdefault((column + 1, row + 1), []).append((column, row + 1))
            if not padded[r, c - 1]:
                edges.setdefault((column, row + 1), []).append((column, row))
    return edges


def trace_loop(edges, start):
    loop, current = [start], start
    while True:
        following = edges[current].pop()
        if not edges[current]:
            del edges[current]
        if following == start:
            return loop
        loop.append(following)
        current = following


def drop_collinear(loop):
    kept = []
    for index, point in enumerate(loop):
        before, after = loop[index - 1], loop[(index + 1) % len(loop)]
        if (point[0] - before[0]) * (after[1] - point[1]) != (point[1] - before[1]) * (after[0] - point[0]):
            kept.append(point)
    return kept


def cell_outlines(mask):
    edges = boundary_edges(mask)
    loops = []
    while edges:
        loops.append(drop_collinear(trace_loop(edges, next(iter(edges)))))
    return loops


def raster_cells(indices, member, palette_rgb):
    image = np.zeros(indices.shape + (4,), dtype=np.uint8)
    image[member, :3] = palette_rgb[indices[member]]
    image[member, 3] = 255
    return cv2.resize(image, (indices.shape[1] * CELL_RASTER_PX, indices.shape[0] * CELL_RASTER_PX), interpolation=cv2.INTER_NEAREST)


def draw_shape(canvas, shape, scale):
    layer = np.zeros(canvas.shape[:2], dtype=np.uint8)
    big = SUPERSAMPLE
    mask = np.zeros((layer.shape[0] * big, layer.shape[1] * big), dtype=np.uint8)
    contours = [np.round(outline * scale * big).astype(np.int32).reshape(-1, 1, 2) for outline in shape.outlines]
    if shape.ellipse:
        (cx, cy), (width, height), angle = shape.ellipse
        cv2.ellipse(mask, ((cx * scale * big, cy * scale * big), (width * scale * big, height * scale * big), angle), 255, -1)
    else:
        cv2.drawContours(mask, contours, -1, 255, -1, lineType=cv2.LINE_AA) if len(contours) == 1 else _draw_with_holes(mask, contours)
    alpha = cv2.resize(mask, (layer.shape[1], layer.shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    colour = lab_to_rgb(shape.lab).astype(np.float32)
    canvas[:, :, :3] = canvas[:, :, :3] * (1 - alpha[..., None]) + colour * alpha[..., None]
    canvas[:, :, 3] = np.maximum(canvas[:, :, 3], (alpha * 255).astype(np.uint8))


def _draw_with_holes(mask, contours):
    cv2.fillPoly(mask, [contours[0]], 255)
    for hole in contours[1:]:
        cv2.fillPoly(mask, [hole], 0)
