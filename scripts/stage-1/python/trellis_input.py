import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from superres import fit_square, super_resolve
from whiskers import remove_whiskers

ALPHA_FLOOR = 20
PLINTH_ROWS_FROM = 0.5
MIN_CHROMA = 11.0
FULL_CHROMA = 24.0
DOMINANT_CHROMA = 30.0
HUE_TOLERANCE = 30.0
HUE_BINS = 36
SLAB_MIN_PIXELS = 500
FRINGE_RADIUS = 4
WHITE_LIGHTNESS = 99.0
REFERENCE_PERCENTILE = 50
MARGIN_RATIO = 0.02
THIN_KERNEL = 25
THIN_MIN_BRIGHTNESS = 140
STRAY_MIN_PIXELS = 400
REMOVAL_GROWTH = 3
EDGE_SMOOTHING = 9
STRAND_ROWS_TO = 0.55
FLOOR_ROWS_FROM = 0.85
FLOOR_SLIVER_HEIGHT = 0.035
FLOOR_SLIVER_MIN_SIDE = 0.02


def to_lab(bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def to_bgr(lab: np.ndarray) -> np.ndarray:
    return np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2BGR) * 255.0, 0, 255)


def chroma_and_hue(lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a, b = lab[:, :, 1], lab[:, :, 2]
    return np.hypot(a, b), np.degrees(np.arctan2(b, a)) % 360.0


def plinth_rows(alpha: np.ndarray) -> np.ndarray:
    ys = np.nonzero((alpha > ALPHA_FLOOR).any(axis=1))[0]
    rows = np.zeros(alpha.shape, bool)
    rows[int(ys.min() + PLINTH_ROWS_FROM * (ys.max() - ys.min())):] = True
    return rows & (alpha > ALPHA_FLOOR)


def dominant_hue(chroma: np.ndarray, hue: np.ndarray, region: np.ndarray) -> float | None:
    candidates = region & (chroma >= DOMINANT_CHROMA)
    if candidates.sum() < 200:
        return None
    counts, edges = np.histogram(hue[candidates], bins=HUE_BINS, range=(0, 360))
    peak = int(counts.argmax())
    return float((edges[peak] + edges[peak + 1]) / 2)


def hue_distance(hue: np.ndarray, centre: float) -> np.ndarray:
    delta = np.abs(hue - centre)
    return np.minimum(delta, 360.0 - delta)


def plinth_membership(lab: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    chroma, hue = chroma_and_hue(lab)
    region = plinth_rows(alpha)
    centre = dominant_hue(chroma, hue, region)
    if centre is None:
        return np.zeros(alpha.shape, np.float32)
    colourful = np.clip((chroma - MIN_CHROMA) / (FULL_CHROMA - MIN_CHROMA), 0.0, 1.0)
    on_hue = np.clip(1.0 - (hue_distance(hue, centre) - HUE_TOLERANCE / 2) / (HUE_TOLERANCE / 2), 0.0, 1.0)
    return (colourful * on_hue * region).astype(np.float32)


def slab_neighbourhood(membership: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats((membership > 0.8).astype(np.uint8))
    slab = np.isin(labels, [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] >= SLAB_MIN_PIXELS])
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * FRINGE_RADIUS + 1, 2 * FRINGE_RADIUS + 1))
    return cv2.dilate(slab.astype(np.uint8), kernel) > 0


def whiten_plinth(bgr: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, float]:
    lab = to_lab(bgr)
    membership = plinth_membership(lab, alpha)
    membership = membership * slab_neighbourhood(membership)
    if membership.max() <= 0:
        return bgr, 0.0
    reference = float(np.percentile(lab[:, :, 0][membership > 0.9], REFERENCE_PERCENTILE))
    target = np.stack([np.clip(lab[:, :, 0] * WHITE_LIGHTNESS / reference, 0, 100),
                       np.zeros_like(membership), np.zeros_like(membership)], axis=2)
    blended = lab * (1.0 - membership[:, :, None]) + target * membership[:, :, None]
    return to_bgr(blended).astype(np.uint8), float(membership.sum())


def prepare(arguments: argparse.Namespace) -> dict:
    source = cv2.imread(arguments.cutout, cv2.IMREAD_UNCHANGED)
    clean, whisker_pixels = remove_whiskers(source)
    whitened, plinth_pixels = whiten_plinth(clean, source[:, :, 3])
    enlarged = super_resolve(whitened, Path(arguments.sr_binary).expanduser(), arguments.sr_model, arguments.sr_scale)
    cv2.imwrite(arguments.out, enlarged)
    return {"sourceSize": list(source.shape[1::-1]), "enlargedSize": list(enlarged.shape[1::-1]),
            "plinthPixels": round(plinth_pixels), "whiskerPixels": whisker_pixels}


def drop_thin_bright_strands(bgra: np.ndarray) -> np.ndarray:
    body = (bgra[:, :, 3] > ALPHA_FLOOR).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (THIN_KERNEL, THIN_KERNEL))
    thin = (body > 0) & (cv2.morphologyEx(body, cv2.MORPH_OPEN, kernel) == 0)
    bright = cv2.cvtColor(bgra[:, :, :3], cv2.COLOR_BGR2GRAY) >= THIN_MIN_BRIGHTNESS
    rows = np.nonzero(body.any(axis=1))[0]
    bright[int(rows.min() + STRAND_ROWS_TO * (rows.max() - rows.min())):] = False
    cleaned = bgra.copy()
    growth = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (REMOVAL_GROWTH, REMOVAL_GROWTH))
    cleaned[cv2.dilate((thin & bright).astype(np.uint8), growth) > 0, 3] = 0
    cleaned[:, :, 3] = cv2.medianBlur(cleaned[:, :, 3], EDGE_SMOOTHING)
    count, labels, stats, _ = cv2.connectedComponentsWithStats((cleaned[:, :, 3] > ALPHA_FLOOR).astype(np.uint8))
    stray = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] < STRAY_MIN_PIXELS]
    cleaned[np.isin(labels, stray), 3] = 0
    return cleaned


def drop_floor_slivers(bgra: np.ndarray) -> np.ndarray:
    """Plinth leftovers are flat wedges at paw level: too short to hold a vertical run that paws and toes hold."""
    body = (bgra[:, :, 3] > ALPHA_FLOOR).astype(np.uint8)
    rows = np.nonzero(body.any(axis=1))[0]
    height = rows.max() - rows.min()
    sliver_height = max(3, int(FLOOR_SLIVER_HEIGHT * height))
    upright = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((sliver_height, 1), np.uint8))
    flat = (body > 0) & (upright == 0)
    flat[:int(rows.min() + FLOOR_ROWS_FROM * height)] = False
    count, labels, stats, _ = cv2.connectedComponentsWithStats(flat.astype(np.uint8))
    min_area = (FLOOR_SLIVER_MIN_SIDE * height) ** 2
    slivers = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] >= min_area]
    cleaned = bgra.copy()
    cleaned[np.isin(labels, slivers), 3] = 0
    cleaned[:, :, 3] = cv2.medianBlur(cleaned[:, :, 3], EDGE_SMOOTHING)
    return cleaned


def compose(arguments: argparse.Namespace) -> dict:
    enlarged_cutout = cv2.imread(arguments.cutout, cv2.IMREAD_UNCHANGED)
    cleaned = drop_floor_slivers(drop_thin_bright_strands(enlarged_cutout))
    cv2.imwrite(arguments.out, fit_square(cleaned, arguments.size, MARGIN_RATIO))
    return {"size": arguments.size}


def main():
    parser = argparse.ArgumentParser(description="Condition a FLUX cutout for TRELLIS")
    modes = parser.add_subparsers(dest="mode", required=True)
    prepare_parser = modes.add_parser("prepare", help="remove whiskers, whiten the plinth and enlarge with Real-ESRGAN")
    prepare_parser.add_argument("--cutout", required=True, help="RGBA cutout of the chosen art")
    prepare_parser.add_argument("--out", required=True, help="enlarged RGB image")
    prepare_parser.add_argument("--sr-binary", required=True)
    prepare_parser.add_argument("--sr-model", default="realesrgan-x4plus-anime")
    prepare_parser.add_argument("--sr-scale", type=int, default=4)
    compose_parser = modes.add_parser("compose", help="fit the enlarged RGBA cutout into the square TRELLIS canvas")
    compose_parser.add_argument("--cutout", required=True, help="enlarged RGBA cutout")
    compose_parser.add_argument("--out", required=True)
    compose_parser.add_argument("--size", type=int, default=1024)
    arguments = parser.parse_args()
    print(json.dumps(prepare(arguments) if arguments.mode == "prepare" else compose(arguments)))


if __name__ == "__main__":
    main()
