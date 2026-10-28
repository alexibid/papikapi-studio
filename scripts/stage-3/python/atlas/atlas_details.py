"""Details that flat colour would destroy (an eye: pale iris, slit pupil) keep their baked colours.

A detail is a rare colour family (a small share of the figure) plus everything it encloses: the iris and the
pupil inside it. Coloured texels that the palette turned grey, black or white are details too (the edge of an
iris on a neighbouring face). Large patches are flattened elsewhere; borders between flat patches are softened by one texel
so they do not show as stairs."""
import numpy as np
from scipy import ndimage


def lost_colour(baked_chroma: np.ndarray, labels: np.ndarray, neutral_families: list, min_chroma: float) -> np.ndarray:
    return (baked_chroma >= min_chroma) & np.isin(labels, neutral_families)


def detail_zone(labels: np.ndarray, islands: np.ndarray, seeds: np.ndarray, margin_px: int) -> np.ndarray:
    rare = seeds
    grown = ndimage.binary_dilation(rare, iterations=margin_px) & (islands > 0)
    filled = ndimage.binary_fill_holes(grown)
    return filled & (islands > 0) & same_face_as_rare(islands, rare)


def same_face_as_rare(islands: np.ndarray, rare: np.ndarray) -> np.ndarray:
    """Limits the zone to faces that actually contain the rare colour, never spilling onto a neighbour face."""
    return np.isin(islands, np.unique(islands[rare]))


def rare_families(labels: np.ndarray, covered: np.ndarray, max_share: float) -> list:
    shares = np.bincount(labels[covered], minlength=int(labels.max()) + 1) / covered.sum()
    return [family for family, share in enumerate(shares) if 0 < share < max_share]


def keep_baked(flat: np.ndarray, baked: np.ndarray, zone: np.ndarray, denoise_px: int) -> np.ndarray:
    smooth = np.stack([ndimage.median_filter(baked[..., channel], size=denoise_px) for channel in range(3)], axis=2)
    out = flat.copy()
    out[zone] = smooth[zone]
    return out


def soften_borders(flat: np.ndarray, labels: np.ndarray, islands: np.ndarray, sigma_px: float) -> np.ndarray:
    """Anti-aliases the border between two flat families, inside one face only."""
    border = np.zeros(labels.shape, dtype=bool)
    for axis in (0, 1):
        change = np.diff(labels, axis=axis) != 0
        same_face = np.diff(islands, axis=axis) == 0
        edge = change & same_face
        if axis == 0:
            border[1:] |= edge
            border[:-1] |= edge
        else:
            border[:, 1:] |= edge
            border[:, :-1] |= edge
    blurred = np.stack([ndimage.gaussian_filter(flat[..., channel], sigma_px) for channel in range(3)], axis=2)
    out = flat.copy()
    out[border] = blurred[border]
    return out
