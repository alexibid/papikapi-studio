"""Linhas finas como tracos: esqueleto da mascara -> cadeia continua -> Bezier de Schneider.
Uma palpebra deixa de ser um poligono partido e passa a ser um unico traco com pontas redondas.

Tudo e limitado: cada componente e tratado na sua caixa, ha um maximo de tracos e um orcamento de
tempo por vista. Se o orcamento rebenta, a camada volta aos poligonos (nunca bloqueia o pipeline)."""
import time
from dataclasses import dataclass
from typing import List, Tuple
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree
from curve_fit import fit_open_curve, segments_path, segments_polyline

NEIGHBOURS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
MIN_TURN_ALIGNMENT = 0.3
WIDTH_SLACK = 1.6
MAX_CHAINS = 12
MAX_STROKE_COMPONENTS = 60
MAX_JOIN_ROUNDS = 6
MIN_SELF_JOIN_POINTS = 8


class StrokeBudgetExceeded(Exception):
    """O tempo reservado aos tracos acabou: a camada usa poligonos."""


@dataclass
class Stroke:
    points: np.ndarray  # (n, 2) em x, y
    width: float


def _check(deadline: float):
    if time.monotonic() > deadline:
        raise StrokeBudgetExceeded()


def skeletonize(mask, deadline: float = float("inf")):
    """Adelgacamento de Zhang-Suen (vectorizado)."""
    image = np.pad(mask.astype(np.uint8), 1)
    changed = True
    while changed:
        _check(deadline)
        changed = False
        for step in (0, 1):
            p = [np.roll(np.roll(image, -dy, 0), -dx, 1) for dy, dx in NEIGHBOURS]
            neighbours = sum(p)
            transitions = sum(((p[i] == 0) & (p[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                edge = (p[0] * p[2] * p[4] == 0) & (p[2] * p[4] * p[6] == 0)
            else:
                edge = (p[0] * p[2] * p[6] == 0) & (p[0] * p[4] * p[6] == 0)
            removable = (image == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1) & edge
            if removable.any():
                image[removable] = 0
                changed = True
    return image[1:-1, 1:-1].astype(bool)


def _skeleton_graph(skeleton):
    rows, cols = np.nonzero(skeleton)
    index = -np.ones(skeleton.shape, dtype=int)
    index[rows, cols] = np.arange(len(rows))
    sources, targets, lengths = [], [], []
    for dy, dx in NEIGHBOURS:
        ny, nx = rows + dy, cols + dx
        valid = (ny >= 0) & (ny < skeleton.shape[0]) & (nx >= 0) & (nx < skeleton.shape[1])
        neighbour = np.full(len(rows), -1)
        neighbour[valid] = index[ny[valid], nx[valid]]
        linked = neighbour >= 0
        sources.append(np.nonzero(linked)[0])
        targets.append(neighbour[linked])
        lengths.append(np.full(int(linked.sum()), np.hypot(dy, dx)))
    count = len(rows)
    graph = coo_matrix((np.concatenate(lengths), (np.concatenate(sources), np.concatenate(targets))), shape=(count, count)).tocsr()
    return graph, np.stack([cols, rows], axis=1).astype(np.float64)


def _longest_path(graph, nodes_in_component):
    distance = dijkstra(graph, indices=nodes_in_component[0], directed=False)
    far = nodes_in_component[np.argmax(distance[nodes_in_component])]
    distance, parents = dijkstra(graph, indices=far, directed=False, return_predecessors=True)
    end = nodes_in_component[np.argmax(distance[nodes_in_component])]
    path = [end]
    while path[-1] != far:
        path.append(parents[path[-1]])
    return path


def _drop_short_components(skeleton, min_length: float):
    labels, count = ndimage.label(skeleton, structure=np.ones((3, 3)))
    if not count:
        return skeleton
    sizes = ndimage.sum(skeleton, labels, np.arange(1, count + 1))
    return np.isin(labels, 1 + np.nonzero(sizes >= min_length)[0])


def skeleton_chains(skeleton, min_branch: float) -> List[np.ndarray]:
    """Cadeia principal do esqueleto + ramos longos; ramos curtos (ruido) sao descartados."""
    remaining = skeleton.copy()
    chains: List[np.ndarray] = []
    while remaining.any() and len(chains) < MAX_CHAINS:
        graph, coordinates = _skeleton_graph(remaining)
        _, component = connected_components(graph, directed=False)
        members = np.nonzero(component == int(np.argmax(np.bincount(component))))[0]
        chain = coordinates[_longest_path(graph, members)]
        length = float(np.sum(np.hypot(*np.diff(chain, axis=0).T))) if len(chain) > 1 else 0.0
        used = np.zeros_like(remaining)
        used[chain[:, 1].astype(int), chain[:, 0].astype(int)] = True
        remaining &= ~ndimage.binary_dilation(used, structure=np.ones((3, 3)))
        if length >= min_branch or not chains:
            chains.append(chain)
        remaining = _drop_short_components(remaining, min_branch)
    return chains


def _outward(points, at_end: bool, reach: int = 5):
    span = min(reach, len(points) - 1)
    vector = points[-1] - points[-1 - span] if at_end else points[0] - points[span]
    length = np.hypot(*vector)
    return vector / length if length > 1e-9 else np.zeros(2)


def _link_candidates(chains, gap: float):
    """Pares de pontas proximas (KD-tree) com direcao compativel, ordenados pela distancia."""
    ends = np.array([chain[-1 if at_end else 0] for chain in chains for at_end in (False, True)])
    tangents = np.array([_outward(chain, at_end) for chain in chains for at_end in (False, True)])
    candidates = []
    for a, b in cKDTree(ends).query_pairs(gap, output_type="ndarray"):
        if a // 2 == b // 2 and len(chains[a // 2]) < MIN_SELF_JOIN_POINTS:
            continue
        link = ends[b] - ends[a]
        distance = float(np.hypot(*link))
        if distance > 1.5:
            direction = link / distance
            if direction @ tangents[a] < MIN_TURN_ALIGNMENT or -direction @ tangents[b] < MIN_TURN_ALIGNMENT:
                continue
        candidates.append((distance, int(a), int(b)))
    return sorted(candidates)


def _apply_links(chains, widths, candidates):
    used, merged_chains, merged_widths = set(), [], []
    for _, a, b in candidates:
        first, second = a // 2, b // 2
        if first in used or second in used:
            continue
        used.update((first, second))
        if first == second:
            merged_chains.append(np.vstack([chains[first], chains[first][:1]]))
            merged_widths.append(widths[first])
            continue
        head = chains[first] if a % 2 else chains[first][::-1]
        tail = chains[second][::-1] if b % 2 else chains[second]
        weights = np.array([len(head), len(tail)], dtype=np.float64)
        merged_chains.append(np.vstack([head, tail]))
        merged_widths.append(float(np.average([widths[first], widths[second]], weights=weights)))
    for index, chain in enumerate(chains):
        if index not in used:
            merged_chains.append(chain)
            merged_widths.append(widths[index])
    return merged_chains, merged_widths


def join_chains(chains, widths, gap: float, deadline: float):
    """Une pontas proximas com direcao compativel: um corte pequeno nao parte o traco."""
    for _ in range(MAX_JOIN_ROUNDS):
        _check(deadline)
        candidates = _link_candidates(chains, gap)
        if not candidates:
            break
        chains, widths = _apply_links(chains, widths, candidates)
    return chains, widths


def smooth_chain(points, sigma: float):
    """Suaviza a cadeia mantendo as pontas; tira o serrilhado do esqueleto."""
    if len(points) < 5 or sigma <= 0:
        return points
    pad = int(3 * sigma) + 1
    padded = np.pad(points, ((pad, pad), (0, 0)), mode="edge")
    smooth = ndimage.gaussian_filter1d(padded, sigma, axis=0)[pad:-pad]
    smooth[0], smooth[-1] = points[0], points[-1]
    return smooth


def _chain_width(distance, chain) -> float:
    rows = chain[:, 1].astype(int).clip(0, distance.shape[0] - 1)
    cols = chain[:, 0].astype(int).clip(0, distance.shape[1] - 1)
    return max(1.0, 2.0 * float(np.median(distance[rows, cols])) - 1.0)


def _component_chains(part, factor: float, min_branch: float, deadline: float):
    chains = skeleton_chains(skeletonize(part, deadline), min_branch * factor)
    distance = ndimage.distance_transform_edt(part)
    return [(chain, _chain_width(distance, chain)) for chain in chains if len(chain) >= 3]


def extract_strokes(mask, factor: float, deadline: float, join_gap: float = 6.0, min_branch: float = 12.0,
                    smooth_sigma: float = 2.0) -> List[Stroke]:
    labels, _ = ndimage.label(mask, structure=np.ones((3, 3)))
    chains, widths = [], []
    for label, area in enumerate(ndimage.find_objects(labels), start=1):
        _check(deadline)
        part = np.pad(labels[area] == label, 1)
        origin = np.array([area[1].start - 1, area[0].start - 1], dtype=np.float64)
        for chain, width in _component_chains(part, factor, min_branch, deadline):
            chains.append(chain + origin)
            widths.append(width)
    if not chains:
        return []
    chains, widths = join_chains(chains, widths, join_gap * factor, deadline)
    return [Stroke(smooth_chain(chain, smooth_sigma * factor), width) for chain, width in zip(chains, widths)]


def split_thin_components(mask, factor: float, max_width: float, min_length: float,
                          deadline: float) -> Tuple[np.ndarray, np.ndarray]:
    """Separa a mascara em (componentes finos e longos -> tracos, resto -> poligonos)."""
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    thin = np.zeros(mask.shape, dtype=bool)
    if not count:
        return thin, mask
    areas = ndimage.sum(mask, labels, np.arange(1, count + 1))
    found = []
    for label, area in enumerate(ndimage.find_objects(labels), start=1):
        if areas[label - 1] < min_length * factor:
            continue
        _check(deadline)
        part = np.pad(labels[area] == label, 1)
        distance = ndimage.distance_transform_edt(part)
        if 2.0 * distance.max() > max_width * factor * WIDTH_SLACK:
            continue
        skeleton = skeletonize(part, deadline)
        length = int(skeleton.sum())
        if length >= min_length * factor and 2.0 * np.median(distance[skeleton]) <= max_width * factor:
            found.append((length, area, part[1:-1, 1:-1]))
    for _, area, part in sorted(found, key=lambda item: -item[0])[:MAX_STROKE_COMPONENTS]:
        thin[area] |= part
    return thin, mask & ~thin


def stroke_svg(stroke: Stroke, offset, color: str, error: float):
    """Devolve (elemento SVG, segmentos Bezier ajustados) com pontas redondas e sem preenchimento."""
    segments = fit_open_curve(stroke.points, error)
    shifted = [tuple(point + offset for point in segment) for segment in segments]
    element = (f'<path fill="none" stroke="{color}" stroke-width="{stroke.width:.2f}" '
               f'stroke-linecap="round" stroke-linejoin="round" d="{segments_path(shifted)}"/>')
    return element, shifted


def paint_stroke(image: Image.Image, segments, width: float, rgb, scale: int):
    """Desenha o mesmo traco no raster: linha com pontas redondas."""
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    line = [tuple(p) for p in segments_polyline(segments) * scale]
    thickness = max(1, int(round(width * scale)))
    draw.line(line, fill=255, width=thickness, joint="curve")
    radius = thickness / 2.0
    for x, y in (line[0], line[-1]):
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)
    image.paste(tuple(rgb) + (255,), mask=mask)
