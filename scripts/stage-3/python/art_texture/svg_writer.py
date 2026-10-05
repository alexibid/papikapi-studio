import cv2
import numpy as np

from vector_layers import cell_outlines, hex_of

UNITS_PER_CELL = 100
SIMPLIFY_EPSILON_PX = 0.9


def polygon_path(loop):
    points = [(x * UNITS_PER_CELL, y * UNITS_PER_CELL) for x, y in loop]
    return "M" + " L".join(f"{x:g},{y:g}" for x, y in points) + " Z"


def smooth_path(outline, scale):
    simplified = cv2.approxPolyDP(outline.astype(np.float32).reshape(-1, 1, 2), SIMPLIFY_EPSILON_PX, True)[:, 0, :] * scale
    count = len(simplified)
    if count < 3:
        return ""
    commands = [f"M{simplified[0][0]:.2f},{simplified[0][1]:.2f}"]
    for index in range(count):
        p0, p1, p2, p3 = (simplified[(index + offset) % count] for offset in (-1, 0, 1, 2))
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        commands.append(f"C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    return " ".join(commands) + " Z"


def shape_element(shape, scale):
    colour = hex_of(shape.lab)
    if shape.ellipse:
        (cx, cy), (width, height), angle = shape.ellipse
        return (f'<ellipse cx="{cx * scale:.2f}" cy="{cy * scale:.2f}" rx="{width * scale / 2:.2f}" '
                f'ry="{height * scale / 2:.2f}" transform="rotate({angle:.2f} {cx * scale:.2f} {cy * scale:.2f})" fill="{colour}"/>')
    path = " ".join(smooth_path(outline, scale) for outline in shape.outlines)
    return f'<path d="{path}" fill="{colour}" fill-rule="evenodd"/>'


def organic_svg(texture):
    width, height = texture.size
    elements = [f'<rect width="{width}" height="{height}" fill="{hex_of(texture.background)}"/>']
    elements.extend(shape_element(shape, 1.0) for shape in texture.shapes)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
            f'shape-rendering="geometricPrecision">\n' + "\n".join(elements) + "\n</svg>\n")


def region_svg(texture, palette):
    if not texture.pixel:
        return organic_svg(texture)
    grid = texture.grid
    elements = []
    for colour_index in np.unique(texture.indices[texture.resolved]):
        mask = (texture.indices == colour_index) & texture.resolved
        path = " ".join(polygon_path(loop) for loop in cell_outlines(mask))
        elements.append(f'<path d="{path}" fill="{hex_of(palette[colour_index])}"/>')
    scale = grid.columns * UNITS_PER_CELL / texture.size[0]
    elements.extend(shape_element(shape, scale) for shape in texture.shapes)
    width, height = grid.columns * UNITS_PER_CELL, grid.rows * UNITS_PER_CELL
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
            f'shape-rendering="geometricPrecision">\n' + "\n".join(elements) + "\n</svg>\n")
