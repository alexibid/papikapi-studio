import cv2
import numpy as np

THIN_KERNEL = 5
MIN_CONTRAST = 8
MIN_LINE_BRIGHTNESS = 140
MAX_LINE_SATURATION = 30
MERGE_RADIUS = 2
FLANK_STEP = 4
MIN_FLANK_DROP = 15
MAX_FLANK_GAP = 12
AXES = ((1, 0), (0, 1), (1, 1), (1, -1))
MIN_EXTENT = 20
EYE_HUE_RANGE = ((15, 60, 60), (90, 255, 255))
EYE_GUARD = 11
MASK_GROWTH = 2
ALPHA_FLOOR = 20
SILHOUETTE_BAND = 4
MAX_SILHOUETTE_SHARE = 0.9
INPAINT_RADIUS = 3


def symmetric_ridge(grey: np.ndarray) -> np.ndarray:
    plane = grey.astype(np.int16)
    valid = np.zeros(grey.shape, bool)
    for dx, dy in AXES:
        ahead = np.roll(plane, (-dy * FLANK_STEP, -dx * FLANK_STEP), axis=(0, 1))
        behind = np.roll(plane, (dy * FLANK_STEP, dx * FLANK_STEP), axis=(0, 1))
        valid |= (plane - ahead >= MIN_FLANK_DROP) & (plane - behind >= MIN_FLANK_DROP) & (np.abs(ahead - behind) <= MAX_FLANK_GAP)
    return valid


def thin_white_lines(bgr: np.ndarray) -> np.ndarray:
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (THIN_KERNEL, THIN_KERNEL))
    thin = cv2.morphologyEx(grey, cv2.MORPH_TOPHAT, kernel) >= MIN_CONTRAST
    white = (grey >= MIN_LINE_BRIGHTNESS) & (hsv[:, :, 1] <= MAX_LINE_SATURATION)
    return thin & white & symmetric_ridge(grey)


def long_components(candidate: np.ndarray) -> np.ndarray:
    merge = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MERGE_RADIUS + 1, 2 * MERGE_RADIUS + 1))
    merged = cv2.dilate(candidate.astype(np.uint8), merge)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)
    keep = [i for i in range(1, count) if max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) >= MIN_EXTENT]
    return np.isin(labels, keep) & candidate


def eye_guard(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    eyes = cv2.inRange(hsv, EYE_HUE_RANGE[0], EYE_HUE_RANGE[1])
    return cv2.dilate(eyes, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (EYE_GUARD, EYE_GUARD))) > 0


def silhouette_band(alpha: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * SILHOUETTE_BAND + 1, 2 * SILHOUETTE_BAND + 1))
    body = (alpha > ALPHA_FLOOR).astype(np.uint8)
    return cv2.dilate(body, kernel) != cv2.erode(body, kernel)


def inside_outline(mask: np.ndarray, band: np.ndarray) -> np.ndarray:
    count, labels = cv2.connectedComponents(mask, connectivity=8)
    outline = [i for i in range(1, count) if band[labels == i].mean() > MAX_SILHOUETTE_SHARE]
    mask[np.isin(labels, outline)] = 0
    return mask


def whisker_mask(bgra: np.ndarray) -> np.ndarray:
    bgr = bgra[:, :, :3]
    mask = long_components(thin_white_lines(bgr)).astype(np.uint8) * 255
    mask = inside_outline(mask, silhouette_band(bgra[:, :, 3]))
    mask[eye_guard(bgr)] = 0
    grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MASK_GROWTH + 1, 2 * MASK_GROWTH + 1))
    return cv2.dilate(mask, grow)


def remove_whiskers(bgra: np.ndarray) -> tuple[np.ndarray, int]:
    mask = whisker_mask(bgra)
    return cv2.inpaint(bgra[:, :, :3], mask, INPAINT_RADIUS, cv2.INPAINT_TELEA), int((mask > 0).sum())
