"""Camada de texturas: dentro das zonas de detalhe (olhos, nariz, manchas) mantem as cores reais
e vetoriza com muitas curvas Bezier finas. Nao neutraliza nada."""
import time
from typing import List, Tuple
import numpy as np
from PIL import Image, ImageChops, ImageDraw
from scipy import ndimage
from scipy.cluster.vq import kmeans2
from color_space import lab_to_srgb
from bezier import bezier_path, bezier_polyline
from color_space import srgb_to_lab
from contours import marching_squares, polygon_area, resample, smooth_closed
from detail import residual_zones
from strokes import StrokeBudgetExceeded, extract_strokes, paint_stroke, split_thin_components, stroke_svg

SPECK_CONTRAST = 28.0  # manchas pequenas so se removem se a cor for parecida com a vizinhanca
MAX_LIGHTNESS_GAP = 7.0  # nunca funde cores com brilho muito diferente (mantem reflexos e linhas finas)
CHROMA_WEIGHT = np.array([1.0, 3.6, 3.6])


def _hex(color) -> str:
    return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in color)


def sharpen_zone(lab, mask, factor, amount: float, sigma: float):
    """Realce de contornos (unsharp mask em Lab) so dentro da zona: tira o aspecto desfocado da textura do TRELLIS."""
    if amount <= 0:
        return lab
    out = lab.copy()
    blurred = np.stack([ndimage.gaussian_filter(lab[:, :, c], sigma * factor) for c in range(3)], axis=2)
    sharp = lab + amount * (lab - blurred)
    reach = max(3, int(round(2.5 * factor)))
    for c in range(3):  # sem sobreimpulso: nunca passa dos extremos da vizinhanca (evita halos brancos)
        sharp[:, :, c] = np.clip(sharp[:, :, c], ndimage.minimum_filter(lab[:, :, c], size=reach),
                                 ndimage.maximum_filter(lab[:, :, c], size=reach))
    out[mask] = sharp[mask]
    return out


def ink_lines(lab, mask, factor: float, radius: float = 3.5, contrast: float = 12.0, max_l: float = 70.0, min_area: float = 40.0):
    """Linhas escuras finas (contorno do olho, pestanas, bigodes): mais escuras que a vizinhanca imediata."""
    lightness = lab[:, :, 0]
    size = max(3, int(round(2 * radius * factor)) | 1)
    closed = ndimage.grey_closing(np.where(mask, lightness, 100.0), size=(size, size))
    line = ((closed - lightness) >= contrast) & (lightness <= max_l) & mask
    labels, count = ndimage.label(line)
    if count:
        sizes = ndimage.sum(line, labels, np.arange(1, count + 1))
        line = np.isin(labels, 1 + np.nonzero(sizes >= min_area * factor * factor)[0])
    return line


def boost_contrast(lab, mask, factor: float, gain: float, sigma: float = 6.0):
    """Mais contraste local no brilho: os tons medios (cinzentos de transicao) afastam-se para o claro ou o escuro."""
    if gain <= 1.0:
        return lab
    out = lab.copy()
    local = ndimage.gaussian_filter(lab[:, :, 0], sigma * factor)
    stretched = local + gain * (lab[:, :, 0] - local)
    out[:, :, 0] = np.where(mask, np.clip(stretched, 0, 100), lab[:, :, 0])
    return out


def drop_specks(labels, mask, factor: float, min_area: float, colors, contrast: float = SPECK_CONTRAST):
    """Remove manchas minusculas de baixo contraste (speckles); detalhes pequenos mas fortes (pupilas, reflexos) ficam."""
    if min_area <= 0:
        return labels
    limit = min_area * factor * factor
    small = np.zeros(mask.shape, dtype=bool)
    candidates = []
    for u in np.unique(labels[mask]):
        parts, count = ndimage.label(labels == u)
        if not count:
            continue
        sizes = np.bincount(parts.ravel(), minlength=count + 1)
        tiny = np.zeros(count + 1, dtype=bool)
        tiny[1:] = sizes[1:] < limit
        if not tiny.any():
            continue
        small |= tiny[parts]
        slices = ndimage.find_objects(parts)
        for index in np.nonzero(tiny)[0]:
            area = slices[index - 1]
            candidates.append((u, area, parts[area] == index))
    keep = mask & ~small
    if not candidates or not keep.any():
        return labels
    _, nearest = ndimage.distance_transform_edt(~keep, return_indices=True)
    around = labels[nearest[0], nearest[1]]
    out = labels.copy()
    for u, area, part in candidates:
        neighbour = np.bincount(around[area][part]).argmax()
        gap = np.linalg.norm(srgb_to_lab(colors[u][None])[0] - srgb_to_lab(colors[neighbour][None])[0])
        if gap < contrast:
            out[area][part] = around[area][part]
    return out


def join_nearby(mask, radius: float):
    """Une fragmentos proximos da mesma cor (fecho morfologico): um traco partido passa a ser uma so forma."""
    if radius <= 0 or not mask.any():
        return mask
    rows, cols = np.nonzero(mask)
    pad = int(radius) + 2
    top, left = max(rows.min() - pad, 0), max(cols.min() - pad, 0)
    bottom, right = min(rows.max() + pad + 1, mask.shape[0]), min(cols.max() + pad + 1, mask.shape[1])
    crop = np.pad(mask[top:bottom, left:right], pad)
    dilated = ndimage.distance_transform_edt(~crop) <= radius        # dilatacao por disco via distancia (rapido)
    closed = (ndimage.distance_transform_edt(dilated) > radius)[pad:-pad, pad:-pad]  # erosao = fecho completo
    out = mask.copy()
    out[top:bottom, left:right] = closed
    return out


def rdp_closed(points, epsilon: float, minimum: int = 8):
    """Simplifica o contorno fechado (Ramer-Douglas-Peucker): menos nos, curvas mais limpas."""
    count = len(points)
    if count <= minimum:
        return points
    first = int(np.argmax(np.hypot(*(points - points[0]).T)))
    chains = [np.vstack([points[:first + 1]]), np.vstack([points[first:], points[:1]])]
    kept = []
    for chain in chains:
        keep = np.zeros(len(chain), dtype=bool)
        keep[0] = keep[-1] = True
        stack = [(0, len(chain) - 1)]
        while stack:
            a, b = stack.pop()
            if b <= a + 1:
                continue
            segment = chain[b] - chain[a]
            length = np.hypot(*segment)
            offsets = chain[a + 1:b] - chain[a]
            if length < 1e-9:
                distance = np.hypot(*offsets.T)
            else:
                distance = np.abs(segment[0] * offsets[:, 1] - segment[1] * offsets[:, 0]) / length
            far = int(np.argmax(distance))
            if distance[far] > epsilon:
                keep[a + 1 + far] = True
                stack.append((a, a + 1 + far))
                stack.append((a + 1 + far, b))
        kept.append(chain[keep][:-1])
    result = np.vstack(kept)
    return result if len(result) >= minimum else points


def goo_field(mask, factor: float, big_sigma: float, small_sigma: float, big_area: float):
    """Gooey adaptativo: formas grandes arredondam com desfoque forte; formas pequenas (olhos pequenos, reflexos) com pouco."""
    parts, count = ndimage.label(mask)
    if count == 0:
        return mask.astype(np.float32)
    sizes = ndimage.sum(mask, parts, np.arange(1, count + 1))
    big = np.isin(parts, 1 + np.nonzero(sizes >= big_area * factor * factor)[0])
    return np.maximum(ndimage.gaussian_filter(big.astype(np.float32), big_sigma * factor),
                      ndimage.gaussian_filter((mask & ~big).astype(np.float32), small_sigma * factor))


def smooth_labels(labels, mask, sigma: float):
    """Maioria local das etiquetas: tira o ruido de pixeis soltos sem arredondar as formas."""
    if sigma <= 0:
        return labels
    ids = np.unique(labels[mask])
    best = np.full(labels.shape, -np.inf)
    out = labels.copy()
    for u in ids:
        score = ndimage.gaussian_filter((labels == u).astype(np.float32), sigma)
        better = mask & (score > best)
        best[better] = score[better]
        out[better] = u
    return out


def cluster_zone(lab, rgb, mask, count: int = 16, merge: float = 9.0, seed: int = 1, max_gap: float = MAX_LIGHTNESS_GAP):
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
                if ids[a] != ids[b] and np.linalg.norm(centres[a] - centres[b]) < merge and abs(centres[a][0] - centres[b][0]) < max_gap:
                    ids = [ids[a] if i == ids[b] else i for i in ids]
                    changed = True
    distance = ((points[:, None, :] - centres[None]) ** 2).sum(2)
    labels = np.array(ids)[distance.argmin(1)]
    out = -np.ones(mask.shape, dtype=int)
    out[mask] = labels
    colors = {int(u): np.median(rgb[mask & (out == u)], axis=0) for u in np.unique(labels)}
    return out, colors


def thin_strokes(mask, factor: float, max_width: float, min_length: float, deadline: float):
    """Devolve (tracos, mascara restante). Sem tempo ou com erro de ajuste, tudo fica como poligonos."""
    try:
        thin, rest = split_thin_components(mask, factor, max_width, min_length, deadline)
        return extract_strokes(thin, factor, deadline), rest
    except StrokeBudgetExceeded:
        return [], mask


def texture_layer(rgb, alpha, facet_rgb, facet_alpha, config, count: int = 24, merge: float = 10.0,
                  sharpen_amount: float = 2.0, sharpen_sigma: float = 1.5, label_sigma: float = 2.0, contrast_gain: float = 1.0, ink: bool = True, speck_area: float = 150.0, speck_contrast: float = 24.0, max_gap: float = 7.0, goo_sigma: float = 1.5, goo_threshold: float = 0.5, goo_big_area: float = 600.0, smooth_passes: int = 5, node_step: float = 1.6, join_radius: float = 2.5, line_join: float = 3.5, rdp_epsilon: float = 0.9, stroke_max_width: float = 7.0, stroke_min_length: float = 30.0, stroke_error: float = 0.8, stroke_budget: float = 5.0,
                  sigma: float = 0.35, min_shape: float = 14.0) -> Tuple[List[str], int, Image.Image]:
    """Devolve (paths SVG, numero de nos, RGBA com a camada rasterizada)."""
    size = alpha.shape[0]
    factor = size / 1024.0
    scale = config.raster_scale
    lab = np.zeros(alpha.shape + (3,))
    facet_lab = np.zeros(alpha.shape + (3,))
    inside = (alpha >= 0.5) & (facet_alpha >= 0.5)
    lab[inside] = srgb_to_lab(rgb[inside])
    facet_lab[inside] = srgb_to_lab(facet_rgb[inside])
    zone, _ = residual_zones(lab, facet_lab, inside, factor)
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    if not zone.any():
        return [], 0, image.resize((size, size))
    rows, cols = np.nonzero(zone)
    margin = int(12 * factor)
    top, left = max(rows.min() - margin, 0), max(cols.min() - margin, 0)
    bottom, right = min(rows.max() + margin + 1, size), min(cols.max() + margin + 1, size)
    window = (slice(top, bottom), slice(left, right))
    offset = np.array([left, top], dtype=np.float64)
    lab, rgb, zone = lab[window], rgb[window], zone[window]
    lab = sharpen_zone(lab, zone, factor, sharpen_amount, sharpen_sigma)
    lab = boost_contrast(lab, zone, factor, contrast_gain)
    line = ink_lines(lab, zone, factor) if ink else np.zeros(zone.shape, dtype=bool)
    rgb = rgb.copy()
    if sharpen_amount > 0:
        rgb[zone] = np.clip(lab_to_srgb(lab[zone]), 0, 1)
    labels, colors = cluster_zone(lab, rgb, zone, count, merge, max_gap=max_gap)
    labels = smooth_labels(labels, zone, label_sigma * factor)
    labels = drop_specks(labels, zone, factor, speck_area, colors, speck_contrast)
    ink_id = -1
    if line.any():
        ink_id = int(labels.max()) + 1
        labels[line] = ink_id
        colors[ink_id] = np.median(rgb[line], axis=0)
    order = sorted(colors, key=lambda u: -(labels == u).sum())
    paths, nodes = [], 0
    stroke_deadline = time.monotonic() + stroke_budget
    for u in order:
        is_line = line.any() and u == ink_id
        # gooey: desfoca a mascara da cor e corta num limiar; funde fragmentos e arredonda as formas (linhas finas ficam de fora)
        mask_u = join_nearby(labels == u, (line_join if is_line else join_radius) * factor)
        strokes = []
        if is_line:
            strokes, mask_u = thin_strokes(mask_u, factor, stroke_max_width, stroke_min_length, stroke_deadline)
        field = goo_field(mask_u, factor, sigma if is_line else goo_sigma, sigma, goo_big_area)
        loops = []
        for raw in marching_squares(np.pad(field, 1), 0.5 if is_line else goo_threshold):
            loop = smooth_closed(raw - 1.0, smooth_passes)
            if polygon_area(loop) < min_shape * factor * factor:
                continue
            loops.append(rdp_closed(resample(loop, node_step * factor), rdp_epsilon * factor) + offset)
        color = _hex(colors[u])
        rgb_bytes = tuple(int(round(v * 255)) for v in colors[u])
        for stroke in strokes:
            element, segments = stroke_svg(stroke, offset, color, stroke_error * factor)
            paths.append(element)
            nodes += 3 * len(segments) + 1
            paint_stroke(image, segments, stroke.width, rgb_bytes, scale)
        if not loops:
            continue
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
