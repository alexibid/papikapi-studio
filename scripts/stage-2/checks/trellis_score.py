import json
import sys
from pathlib import Path

import cv2
import numpy as np

PALETTE_SIZE = 6
NORMAL_SIZE = 192
SPECKLE_AREA_RATIO = 0.0015
PLINTH_VALUE_FLOOR = 40


def figure_mask(image: np.ndarray) -> np.ndarray:
    return image[:, :, 3] > 40


def crop_square(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    rows, cols = np.nonzero(mask)
    crop = image[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    side = max(crop.shape[:2])
    canvas = np.zeros((side, side, image.shape[2]), np.uint8)
    canvas[:crop.shape[0], :crop.shape[1]] = crop
    return cv2.resize(canvas, (NORMAL_SIZE, NORMAL_SIZE), interpolation=cv2.INTER_AREA)


def plinth_mask(lab: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV)
    rows = np.arange(rgb.shape[0])[:, None] >= int(rgb.shape[0] * 0.62)
    return rows & (hsv[:, :, 0] >= 2) & (hsv[:, :, 0] <= 40) & (hsv[:, :, 1] >= 40) & (hsv[:, :, 2] >= PLINTH_VALUE_FLOOR)


def art_palette(art_lab: np.ndarray, keep: np.ndarray) -> np.ndarray:
    samples = art_lab[keep].astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, centres = cv2.kmeans(samples, PALETTE_SIZE, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    return centres


def labels_for(lab: np.ndarray, palette: np.ndarray) -> np.ndarray:
    distance = np.linalg.norm(lab[:, :, None, :].astype(np.float32) - palette[None, None], axis=3)
    return distance.argmin(axis=2)


def palette_shares(labels: np.ndarray, keep: np.ndarray) -> np.ndarray:
    return np.bincount(labels[keep], minlength=PALETTE_SIZE) / max(int(keep.sum()), 1)


def speckle_share(labels: np.ndarray, keep: np.ndarray) -> float:
    limit = SPECKLE_AREA_RATIO * keep.sum()
    speckles = 0
    for index in range(PALETTE_SIZE):
        count, components, stats, _ = cv2.connectedComponentsWithStats(((labels == index) & keep).astype(np.uint8))
        speckles += sum(int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] < limit)
    return speckles / max(int(keep.sum()), 1)


def score(art_path: str, render_path: str) -> dict:
    art = cv2.imread(art_path, cv2.IMREAD_UNCHANGED)
    render = cv2.imread(render_path, cv2.IMREAD_UNCHANGED)
    art_tile = crop_square(art, figure_mask(art))
    render_tile = crop_square(render, figure_mask(render))
    art_lab = cv2.cvtColor(art_tile[:, :, :3], cv2.COLOR_BGR2LAB)
    render_lab = cv2.cvtColor(render_tile[:, :, :3], cv2.COLOR_BGR2LAB)
    art_keep = figure_mask(art_tile) & ~plinth_mask(art_lab, art_tile[:, :, :3])
    render_keep = figure_mask(render_tile) & ~plinth_mask(render_lab, render_tile[:, :, :3])
    palette = art_palette(art_lab, art_keep)
    art_shares = palette_shares(labels_for(art_lab, palette), art_keep)
    render_labels = labels_for(render_lab, palette)
    render_shares = palette_shares(render_labels, render_keep)
    return {
        "paletteMatch": round(float(np.minimum(art_shares, render_shares).sum()), 4),
        "speckleShare": round(speckle_share(render_labels, render_keep), 4),
    }


print(json.dumps(score(sys.argv[1], sys.argv[2])))
