"""Hides the paper plane FLUX drew under the figure.

The system prompt picks the plane colour, so the plane is found by that colour anywhere in the art, not
guessed from the lower rows: at eye level the plane is a strip behind the body. A neutral plane (white,
grey, black) is matched by lightness; a coloured one by hue, and only pixels nearly as saturated as the
plane go, so a tint it bounces onto the paws stays.
"""
import cv2
import numpy as np

HUE_WINDOW = 45.0
HUE_TOLERANCE = 24.0
MIN_PLANE_CHROMA = 30.0
CHROMA_FROM = 0.45
CHROMA_FULL = 0.7
MIN_PLANE_PIXELS = 500
FRINGE_RADIUS = 4
BORDER_PIXELS = 4
NEUTRAL_CHROMA = 10.0
NEUTRAL_LIGHTNESS_WINDOW = 20.0
FLAT_CHROMA_FULL = 6.0
FLAT_CHROMA_ZERO = 12.0
LIGHTNESS_FULL = 6.0
LIGHTNESS_ZERO = 12.0


def to_lab(bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def chroma_and_hue(lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a, b = lab[..., 1], lab[..., 2]
    return np.hypot(a, b), np.degrees(np.arctan2(b, a)) % 360.0


def hue_distance(hue: np.ndarray, centre: float) -> np.ndarray:
    delta = np.abs(hue - centre)
    return np.minimum(delta, 360.0 - delta)


def nominal_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    lab = to_lab(np.array([[[rgb[2], rgb[1], rgb[0]]]], np.uint8))
    chroma, hue = chroma_and_hue(lab)
    return float(lab[0, 0, 0]), float(chroma[0, 0]), float(hue[0, 0])


def falling(values: np.ndarray, full: float, zero: float) -> np.ndarray:
    return np.clip((zero - values) / (zero - full), 0.0, 1.0)


def circular_mean(hues: np.ndarray) -> float:
    radians = np.radians(hues)
    return float(np.degrees(np.arctan2(np.sin(radians).mean(), np.cos(radians).mean())) % 360.0)


def largest_parts(mask: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    return np.isin(labels, [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] >= MIN_PLANE_PIXELS])


def around_plane(membership: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * FRINGE_RADIUS + 1, 2 * FRINGE_RADIUS + 1))
    return membership * (cv2.dilate(largest_parts(membership > 0.8).astype(np.uint8), kernel) > 0)


def coloured_membership(lab: np.ndarray, plane_hue: float) -> np.ndarray:
    chroma, hue = chroma_and_hue(lab)
    candidates = (hue_distance(hue, plane_hue) <= HUE_WINDOW) & (chroma >= MIN_PLANE_CHROMA)
    candidates &= largest_parts(candidates)
    if not candidates.any():
        return np.zeros(chroma.shape, np.float32)
    centre, plane_chroma = circular_mean(hue[candidates]), float(np.median(chroma[candidates]))
    span = (CHROMA_FULL - CHROMA_FROM) * plane_chroma
    colourful = np.clip((chroma - CHROMA_FROM * plane_chroma) / span, 0.0, 1.0)
    on_hue = np.clip(1.0 - (hue_distance(hue, centre) - HUE_TOLERANCE / 2) / (HUE_TOLERANCE / 2), 0.0, 1.0)
    return around_plane((colourful * on_hue).astype(np.float32))


def neutral_membership(lab: np.ndarray, plane_lightness: float) -> np.ndarray:
    chroma, lightness = chroma_and_hue(lab)[0], lab[..., 0]
    candidates = (chroma < NEUTRAL_CHROMA) & (np.abs(lightness - plane_lightness) <= NEUTRAL_LIGHTNESS_WINDOW)
    candidates &= largest_parts(candidates)
    if not candidates.any():
        return np.zeros(chroma.shape, np.float32)
    measured = float(np.median(lightness[candidates]))
    flat = falling(chroma, FLAT_CHROMA_FULL, FLAT_CHROMA_ZERO)
    level = falling(np.abs(lightness - measured), LIGHTNESS_FULL, LIGHTNESS_ZERO)
    return around_plane((flat * level).astype(np.float32))


def plane_membership(lab: np.ndarray, rgb: tuple[int, int, int]) -> np.ndarray:
    lightness, chroma, hue = nominal_lab(rgb)
    if chroma < NEUTRAL_CHROMA:
        return neutral_membership(lab, lightness)
    return coloured_membership(lab, hue)


def background_colour(bgr: np.ndarray) -> np.ndarray:
    border = np.concatenate([bgr[:BORDER_PIXELS].reshape(-1, 3), bgr[-BORDER_PIXELS:].reshape(-1, 3),
                             bgr[:, :BORDER_PIXELS].reshape(-1, 3), bgr[:, -BORDER_PIXELS:].reshape(-1, 3)])
    neutral = border[np.ptp(border.astype(int), axis=1) < 12]
    return np.median(neutral if len(neutral) else border, axis=0)


def hide_plane(bgr: np.ndarray, rgb: tuple[int, int, int]) -> tuple[np.ndarray, float]:
    membership = plane_membership(to_lab(bgr), rgb)[..., None]
    hidden = bgr * (1.0 - membership) + background_colour(bgr) * membership
    return np.clip(hidden, 0, 255).astype(np.uint8), float(membership.sum())
