import numpy as np
from config import VectorizeConfig
from scipy import ndimage


def remove_small_regions(labels, count: int, config: VectorizeConfig):
    for _ in range(2):
        for family in range(count):
            components, total = ndimage.label(labels == family)
            if total == 0:
                continue
            sizes = ndimage.sum(np.ones_like(components), components, index=np.arange(1, total + 1))
            small = np.isin(components, 1 + np.nonzero(sizes < config.min_region_px)[0])
            labels = np.where(small, -1, labels)
        known = labels >= 0
        if known.all():
            continue
        _, nearest = ndimage.distance_transform_edt(~known, return_indices=True)
        labels = labels[nearest[0], nearest[1]]
    return labels


def merge_inner_patches(labels, count: int, base: int, config: VectorizeConfig):
    if config.inner_max_px <= 0:
        return labels
    for family in range(count):
        components, total = ndimage.label(labels == family)
        for index, box in enumerate(ndimage.find_objects(components), 1):
            window = tuple(slice(max(s.start - 3, 0), s.stop + 3) for s in box)
            mask = components[window] == index
            if mask.sum() >= config.inner_max_px:
                continue
            ring = ndimage.binary_dilation(mask, iterations=2) & ~mask
            around = labels[window][ring]
            if around.size == 0:
                continue
            values, counts = np.unique(around, return_counts=True)
            top = int(values[counts.argmax()])
            if top not in (family, base) and counts.max() / around.size >= config.inner_enclosed:
                labels[window][mask] = top
    return labels


def open_features(labels, count: int, base: int, config: VectorizeConfig):
    radius = config.open_radius_px
    if radius < 1:
        return labels
    result = labels.copy()
    for family in range(count):
        if family == base:
            continue
        mask = labels == family
        if not mask.any():
            continue
        eroded = ndimage.distance_transform_edt(mask) > radius
        kept = ndimage.distance_transform_edt(~eroded) <= radius
        result[mask & ~kept] = base
    return result


def drop_tints_on_base(labels, count: int, base: int, neutral_count: int, config: VectorizeConfig):
    for family in range(neutral_count, count):
        components, total = ndimage.label(labels == family)
        for index, box in enumerate(ndimage.find_objects(components), 1):
            window = tuple(slice(max(sl.start - 3, 0), sl.stop + 3) for sl in box)
            mask = components[window] == index
            if ndimage.distance_transform_edt(mask).max() > config.tint_max_radius_px:
                continue
            ring = ndimage.binary_dilation(mask, iterations=3) & ~mask
            around = labels[window][ring]
            if around.size and (around == base).mean() >= 0.5:
                labels[window][mask] = base
    return labels


def smooth_labels(labels, count: int, config: VectorizeConfig):
    scores = np.stack([ndimage.gaussian_filter((labels == f).astype(np.float32), config.smooth_sigma) for f in range(count)])
    return scores.argmax(axis=0)
