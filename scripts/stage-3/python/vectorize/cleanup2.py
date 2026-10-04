import numpy as np
from scipy import ndimage

def thin_components(mask, min_length, max_half_width, min_half_width=0.9):
    comps, total = ndimage.label(mask, structure=np.ones((3,3)))
    keep = np.zeros(mask.shape, dtype=bool)
    if total == 0:
        return keep
    edt = ndimage.distance_transform_edt(mask)
    idx = np.arange(1, total+1)
    area = ndimage.sum(mask, comps, idx)
    rmax = ndimage.maximum(edt, comps, idx)
    length = area/np.maximum(2*rmax-1, 1)
    ok = (rmax <= max_half_width) & (rmax >= min_half_width) & (length >= min_length)
    return np.isin(comps, idx[ok])

def remove_small_regions_keep_thin(labels, count, min_area, min_length, max_half_width):
    for _ in range(2):
        for family in range(count):
            mask = labels == family
            comps, total = ndimage.label(mask)
            if total == 0: continue
            sizes = ndimage.sum(np.ones_like(comps), comps, index=np.arange(1,total+1))
            small = np.isin(comps, 1+np.nonzero(sizes < min_area)[0])
            thin = thin_components(small & mask, min_length, max_half_width)
            labels = np.where(small & ~thin, -1, labels)
        known = labels >= 0
        if known.all(): continue
        _, nearest = ndimage.distance_transform_edt(~known, return_indices=True)
        labels = labels[nearest[0], nearest[1]]
    return labels

def open_features_keep_thin(labels, count, base, radius, min_length, max_half_width):
    result = labels.copy()
    for family in range(count):
        if family == base: continue
        mask = labels == family
        if not mask.any(): continue
        eroded = ndimage.distance_transform_edt(mask) > radius
        kept = ndimage.distance_transform_edt(~eroded) <= radius
        thin = thin_components(mask & ~kept, min_length, max_half_width)
        lost = mask & ~kept & ~thin
        result[lost] = base
    return result

def smooth_labels_keep(labels, count, sigma, sharpen=1.0):
    scores = np.stack([ndimage.gaussian_filter((labels == f).astype(np.float32), sigma) for f in range(count)])
    return scores.argmax(axis=0)
