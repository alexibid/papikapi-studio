"""Which texels of the atlas does the model really sample? The rest of the atlas (the TRELLIS plinth) is unused."""
import numpy as np

EDGE_TOLERANCE = 0.02


def rasterise_triangle(mask: np.ndarray, corners: np.ndarray) -> None:
    height, width = mask.shape
    low = np.floor(corners.min(axis=0)).astype(int)
    high = np.ceil(corners.max(axis=0)).astype(int)
    columns, rows = np.meshgrid(
        np.arange(max(low[0], 0), min(high[0], width - 1) + 1), np.arange(max(low[1], 0), min(high[1], height - 1) + 1)
    )
    if columns.size == 0:
        return
    a, b, c = corners
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-12:
        return
    x, y = columns + 0.5, rows + 0.5
    u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
    v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
    inside = (u >= -EDGE_TOLERANCE) & (v >= -EDGE_TOLERANCE) & (1 - u - v >= -EDGE_TOLERANCE)
    mask[rows[inside], columns[inside]] = True


def uv_coverage(triangles: np.ndarray, width: int, height: int) -> np.ndarray:
    """Boolean mask (rows from the top, like the image) of the texels covered by the UV triangles."""
    mask = np.zeros((height, width), dtype=bool)
    scale = np.array([width, height], dtype=np.float64)
    for triangle in triangles:
        rasterise_triangle(mask, triangle * scale)
    return mask
