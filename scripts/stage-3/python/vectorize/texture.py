"""Camada de texturas: dentro das zonas de detalhe (olhos, nariz, manchas) mantem as cores reais
e vetoriza com muitas curvas Bezier finas. Nao neutraliza nada."""
from typing import List, Tuple
import numpy as np
from PIL import Image, ImageChops, ImageDraw
from scipy import ndimage
from scipy.cluster.vq import kmeans2
from bezier import bezier_path, bezier_polyline
from color_space import srgb_to_lab
from contours import marching_squares, polygon_area, resample, smooth_closed
from detail import zones

BASE_SNAP = 14.0  # cores da zona proximas da cor base nao se desenham: ficam a cor base
CHROMA_WEIGHT = np.array([1.0, 2.2, 2.2])


def _hex(color) -> str:
    return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in color)


def cluster_zone(lab, rgb, mask, count: int = 16, merge: float = 9.0, seed: int = 1):
    points = lab[mask] * CHROMA_WEIGHT
    rng = np.random.default_rng(seed)
    sample = rng.choice(len(points), min(len(points), 40000), replace=False)
    centres, _ = kmeans2(points[sample], count, minit="++", seed=seed, missing="warn")
    ids = list(range(count))
    changed = True
    while changed:
        changed = False
        for a in range(count):
            for b in range(a + 1, count):
                if ids[a] != ids[b] and np.linalg.norm(centres[a] - centres[b]) < merge:
                    ids = [ids[a] if i == ids[b] else i for i in ids]
                    changed = True
    distance = ((points[:, None, :] - centres[None]) ** 2).sum(2)
    labels = np.array(ids)[distance.argmin(1)]
    out = -np.ones(mask.shape, dtype=int)
    out[mask] = labels
    colors = {int(u): np.median(rgb[mask & (out == u)], axis=0) for u in np.unique(labels)}
    return out, colors


def texture_layer(rgb, alpha, config, base_rgb=None, count: int = 16, node_step: float = 1.6,
                  sigma: float = 0.35, min_shape: float = 6.0) -> Tuple[List[str], int, Image.Image]:
    """Devolve (paths SVG, numero de nos, RGBA com a camada rasterizada)."""
    size = alpha.shape[0]
    factor = size / 1024.0
    scale = config.raster_scale
    lab = np.zeros(alpha.shape + (3,))
    inside = alpha >= 0.5
    lab[inside] = srgb_to_lab(rgb[inside])
    zone, _, _, _ = zones(lab, inside, factor)
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    if not zone.any():
        return [], 0, image.resize((size, size))
    labels, colors = cluster_zone(lab, rgb, zone, count)
    if base_rgb is not None:
        base_lab = srgb_to_lab(np.asarray(base_rgb, dtype=np.float64)[None])[0]
        colors = {u: c for u, c in colors.items()
                  if np.linalg.norm(srgb_to_lab(c[None])[0] - base_lab) >= BASE_SNAP}
    order = sorted(colors, key=lambda u: -(labels == u).sum())
    paths, nodes = [], 0
    for u in order:
        field = ndimage.gaussian_filter((labels == u).astype(np.float32), sigma * factor)
        loops = []
        for raw in marching_squares(np.pad(field, 1), 0.5):
            loop = smooth_closed(raw - 1.0, 3)
            if polygon_area(loop) < min_shape * factor * factor:
                continue
            loops.append(resample(loop, node_step * factor))
        if not loops:
            continue
        color = _hex(colors[u])
        d = "".join(bezier_path(k, config.tension) for k in loops)
        paths.append(f'<path fill="{color}" fill-rule="evenodd" stroke="{color}" stroke-width="{0.5 * factor:g}" stroke-linejoin="round" d="{d}"/>')
        nodes += sum(len(k) for k in loops)
        mask = Image.new("1", image.size, 0)
        for k in loops:
            layer = Image.new("1", image.size, 0)
            ImageDraw.Draw(layer).polygon([tuple(p) for p in bezier_polyline(k, config.tension) * scale], fill=1)
            mask = ImageChops.logical_xor(mask, layer)
        image.paste(tuple(int(round(v * 255)) for v in colors[u]) + (255,), mask=mask)
    return paths, nodes, image.resize((size, size), Image.Resampling.LANCZOS)
