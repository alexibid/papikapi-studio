"""Paints the visible eye of the art on both eyes of the model, texel by texel, on the UV atlas only.

Each model eye gets a local frame (right points away from the other eye, up points up), so painting the same
decal on both gives a mirrored pair. The decal keeps the art's shape and its proportion to the body: the eye
height over the figure height in the art is applied to the model height. The outline and the old TRELLIS
iris texels the new eye does not cover take the model's own fur colour around that eye, so no halo is left.
"""
import numpy as np

from eye_color import matches
from eye_surface import SurfaceMesh, SurfaceEye

SEAM_PIXELS = 1.5


def decal_size(surface: SurfaceMesh, decal: dict) -> tuple[float, float]:
    """Half width and half height on the model, in the art's proportion to the figure height."""
    figure_height = float(np.ptp(surface.corners[:, :, 2]))
    half_height = decal["height_to_figure"] * figure_height / 2.0
    return decal["aspect"] * half_height, half_height


def decal_lookup(decal: dict, across: np.ndarray, along: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Colour and coverage of the decal at eye-local coordinates (1 = edge of the iris)."""
    half_width, half_height = decal["half_size"]
    centre_row, centre_col = decal["centre"]
    rows = centre_row - along * half_height - decal["origin"][0]
    cols = centre_col + decal["outward"] * across * half_width - decal["origin"][1]
    return bilinear(decal["rgb"], rows, cols), bilinear(decal["alpha"][..., None], rows, cols)[:, 0]


def bilinear(grid: np.ndarray, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """Smooth lookup (no jagged edges when the decal is enlarged); zero outside the grid."""
    height, width = grid.shape[:2]
    inside = (rows >= 0) & (rows <= height - 1) & (cols >= 0) & (cols <= width - 1)
    row0 = np.clip(np.floor(rows).astype(np.int64), 0, height - 2)
    col0 = np.clip(np.floor(cols).astype(np.int64), 0, width - 2)
    fr = np.clip(rows - row0, 0, 1)[:, None]
    fc = np.clip(cols - col0, 0, 1)[:, None]
    value = (grid[row0, col0] * (1 - fr) * (1 - fc) + grid[row0 + 1, col0] * fr * (1 - fc)
             + grid[row0, col0 + 1] * (1 - fr) * fc + grid[row0 + 1, col0 + 1] * fr * fc)
    return np.where(inside[:, None], value, 0.0).astype(np.float32)


def texels_of(surface: SurfaceMesh, triangle: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Texel rows/cols covered by a triangle and the 3D point under each texel centre."""
    height, width = surface.texture.shape[:2]
    pixel = surface.uvs[triangle] * np.array([width, height])
    low = np.floor(pixel.min(axis=0)).astype(np.int64)
    high = np.ceil(pixel.max(axis=0)).astype(np.int64)
    cols, rows = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
    points = np.stack([cols.ravel() + 0.5, rows.ravel() + 0.5], axis=1)
    a, b, c = pixel
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-12:
        return np.empty(0, np.int64), np.empty(0, np.int64), np.empty((0, 3))
    w0 = ((b[1] - c[1]) * (points[:, 0] - c[0]) + (c[0] - b[0]) * (points[:, 1] - c[1])) / denominator
    w1 = ((c[1] - a[1]) * (points[:, 0] - c[0]) + (a[0] - c[0]) * (points[:, 1] - c[1])) / denominator
    w2 = 1.0 - w0 - w1
    # Reach SEAM_PIXELS past each edge: texels on UV island borders are blended in by texture filtering,
    # so leaving them with the old colour shows thin lines of the old eye.
    double_area = abs(denominator)
    edges = [np.linalg.norm(b - c), np.linalg.norm(c - a), np.linalg.norm(a - b)]
    slack = [SEAM_PIXELS * edge / double_area for edge in edges]
    inside = (w0 >= -slack[0]) & (w1 >= -slack[1]) & (w2 >= -slack[2])
    weights = np.stack([w0, w1, w2], axis=1)[inside]
    rows_out = np.clip(rows.ravel()[inside], 0, height - 1)
    cols_out = np.clip(cols.ravel()[inside], 0, width - 1)
    return rows_out, cols_out, weights @ surface.corners[triangle]


def paint_eye(surface: SurfaceMesh, eye: SurfaceEye, decal: dict, settings: dict) -> dict:
    half_width, half_height = decal_size(surface, decal)
    reach = settings["paint_radius_ratio"] * max(half_width, half_height)
    near = np.linalg.norm(surface.corners.mean(axis=1) - eye.centre, axis=1) < reach * 1.5
    facing = np.abs(surface.normals @ eye.normal) > settings["facing_min"]  # mixed windings
    rows, cols, across, along = eye_texels(surface, eye, np.nonzero(near & facing)[0], (half_width, half_height, reach))
    current = surface.texture[rows, cols, :3]
    rgb, alpha = decal_lookup(decal, across, along)
    iris = decal_lookup({**decal, "alpha": decal["iris"]}, across, along)[1]
    stale = matches(current, decal["signature"], stale_settings(settings))
    fur = np.median(current[(alpha < 0.05) & ~stale], axis=0)
    current[stale] = fur
    outline = np.clip(alpha - iris, 0.0, 1.0)[:, None]
    surface.texture[rows, cols, :3] = iris[:, None] * rgb + outline * fur + (1.0 - alpha[:, None]) * current
    return {"texels": int(len(rows)), "eyeTexels": int((iris > 0.5).sum()), "staleTexels": int(stale.sum()),
            "fur": [round(float(value), 3) for value in fur]}


def stale_settings(settings: dict) -> dict:
    """Looser iris test for erasing TRELLIS's old eye: its edges are darker and less saturated than its centre."""
    return {**settings, "saturation_min": settings["stale_saturation_min"], "value_min": settings["stale_value_min"]}


def eye_texels(surface: SurfaceMesh, eye: SurfaceEye, triangles: np.ndarray, size: tuple) -> tuple:
    """Unique texels around one eye with their eye-local coordinates (1 = iris edge)."""
    half_width, half_height, reach = size
    found = {}
    for triangle in triangles:
        rows, cols, points = texels_of(surface, triangle)
        offset = points - eye.centre
        across, along = offset @ eye.right / half_width, offset @ eye.up / half_height
        local = (np.hypot(across * half_width, along * half_height) < reach) & (np.abs(offset @ eye.normal) < reach)
        for row, col, x, y in zip(rows[local], cols[local], across[local], along[local]):
            found[(row, col)] = (x, y)
    keys = np.array(list(found.keys()), dtype=np.int64).reshape(-1, 2)
    values = np.array(list(found.values()), dtype=np.float64).reshape(-1, 2)
    return keys[:, 0], keys[:, 1], values[:, 0], values[:, 1]
