import numpy as np

MERGE_DISTANCE = 11.0
LIGHTNESS_WEIGHT = 0.35


def build_palette(colours, merge_distance=MERGE_DISTANCE):
    centres, weights = [], []
    for colour in colours:
        distances = [np.linalg.norm(colour - centre) for centre in centres]
        if distances and min(distances) < merge_distance:
            index = int(np.argmin(distances))
            centres[index] = (centres[index] * weights[index] + colour) / (weights[index] + 1)
            weights[index] += 1
        else:
            centres.append(colour.astype(np.float64))
            weights.append(1)
    return np.array(centres), np.array(weights)


def nearest_index(palette, colour, lightness_weight=1.0):
    scale = np.array([lightness_weight, 1.0, 1.0])
    return int(np.argmin(np.linalg.norm((palette - colour) * scale, axis=1)))


def snap_to_palette(palette, lab, lightness_weight=1.0):
    flat = lab.reshape(-1, 3)
    indices = np.array([nearest_index(palette, colour, lightness_weight) for colour in flat])
    return indices.reshape(lab.shape[:2])


DISTINCT_DISTANCE = 14.0
MINIMUM_DISTINCT_WEIGHT = 2


def dominant_colours(centres, weights, minimum_share):
    major = weights / weights.sum() >= minimum_share
    keep = major.copy()
    for index in np.flatnonzero(~major):
        if weights[index] >= MINIMUM_DISTINCT_WEIGHT and np.linalg.norm(centres[major] - centres[index], axis=1).min() >= DISTINCT_DISTANCE:
            keep[index] = True
    return centres[keep], weights[keep]
