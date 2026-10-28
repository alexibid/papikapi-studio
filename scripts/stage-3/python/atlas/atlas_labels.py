"""Colour families on the atlas: every texel takes the flat colour of its family, borders between families are
smoothed, grain and specks are absorbed by the surrounding family, and small but strong details are kept."""
import numpy as np
from scipy import ndimage


def family_labels(palette, rgb: np.ndarray, covered: np.ndarray) -> np.ndarray:
    labels = np.full(covered.shape, -1, dtype=np.int64)
    labels[covered] = palette.classify(rgb[covered])
    return labels


def smooth_borders(labels: np.ndarray, covered: np.ndarray, sigma_px: float) -> np.ndarray:
    """Smooth contours between families: each family's presence is blurred and every texel takes the strongest.
    Only covered texels count, and faces sit further apart on the atlas than the blur reaches, so two faces never
    mix. Ragged, stair-stepped borders become straight or gently curved."""
    weight = np.maximum(ndimage.gaussian_filter(covered.astype(np.float32), sigma_px), 1e-6)
    best_score = np.full(labels.shape, -1.0, dtype=np.float32)
    best_label = labels.copy()
    for family in np.unique(labels[covered]):
        score = ndimage.gaussian_filter((labels == family).astype(np.float32), sigma_px) / weight
        better = (score > best_score) & covered
        best_score[better] = score[better]
        best_label[better] = family
    return best_label


def absorb_specks(labels: np.ndarray, lab_colours: np.ndarray, min_area: int, keep_contrast: float) -> tuple:
    """Small blobs join the family around them, unless they contrast strongly with it (detail, not noise)."""
    absorbed, kept = 0, 0
    for family in np.unique(labels[labels >= 0]):
        parts, count = ndimage.label(labels == family)
        if not count:
            continue
        sizes = np.bincount(parts.ravel(), minlength=count + 1)
        boxes = ndimage.find_objects(parts)
        for part in np.nonzero(sizes[1:] < min_area)[0] + 1:
            window = padded(boxes[part - 1], labels.shape)
            local = labels[window]
            blob = parts[window] == part
            ring = ndimage.binary_dilation(blob) & ~blob & (local >= 0)
            if not ring.any():
                continue
            around = np.bincount(local[ring]).argmax()
            strong = np.linalg.norm(lab_colours[family] - lab_colours[around]) >= keep_contrast
            if strong and sizes[part] >= min_area // 8:
                kept += 1
                continue
            local[blob] = around
            absorbed += 1
    return labels, absorbed, kept


def padded(box: tuple, shape: tuple) -> tuple:
    return tuple(slice(max(axis.start - 1, 0), min(axis.stop + 1, limit)) for axis, limit in zip(box, shape))
