from dataclasses import dataclass

import cv2
import numpy as np
from scipy import ndimage

from pixel_grid import to_lab

CLUSTER_COUNT = 7
BACKGROUND_DISTANCE = 5.0
MIN_AREA_RATIO = 0.03
MASK_SIGMA_RATIO = 0.05
ELLIPSE_MATCH = 0.93
DILATE_CELLS = 1


@dataclass(frozen=True)
class SmoothShape:
    lab: np.ndarray
    outlines: tuple
    ellipse: tuple


def object_components(grid):
    impure = grid.sampled & ~grid.pure
    labels, count = ndimage.label(ndimage.binary_dilation(impure), structure=np.ones((3, 3)))
    return [(labels == index) & grid.member for index in range(1, count + 1)]


def cell_mask_pixels(cell_mask, size):
    rows, columns = cell_mask.shape
    scaled = cv2.resize(cell_mask.astype(np.uint8), size, interpolation=cv2.INTER_NEAREST)
    return scaled > 0


TRANSITION_DISTANCE = 14.0


def is_transitional(index, centres, counts):
    for first in range(len(centres)):
        for second in range(first + 1, len(centres)):
            if index in (first, second) or counts[index] >= min(counts[first], counts[second]):
                continue
            direction = centres[second] - centres[first]
            length = float(direction @ direction)
            if length == 0:
                continue
            along = float((centres[index] - centres[first]) @ direction) / length
            offset = np.linalg.norm(centres[index] - (centres[first] + along * direction))
            if 0.1 < along < 0.9 and offset < TRANSITION_DISTANCE:
                return True
    return False


def drop_transitional(lab_pixels, labels, centres):
    counts = np.bincount(labels, minlength=len(centres))
    kept = [index for index in range(len(centres)) if not is_transitional(index, centres, counts)]
    kept_centres = centres[kept]
    distances = np.linalg.norm(lab_pixels[:, None, :] - kept_centres[None], axis=2)
    return distances.argmin(axis=1), kept_centres


def cluster_pixels(lab_pixels):
    data = lab_pixels.astype(np.float32)
    count = min(CLUSTER_COUNT, len(data))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, labels, centres = cv2.kmeans(data, count, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    return drop_transitional(data, labels.ravel(), centres)


def smoothed_mask(mask, sigma):
    blurred = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
    return (blurred > 0.5).astype(np.uint8)


def ellipse_of(contour):
    if len(contour) < 5:
        return ()
    fitted = cv2.fitEllipse(contour)
    canvas = np.zeros((int(max(contour[:, 0, 1])) + 3, int(max(contour[:, 0, 0])) + 3), dtype=np.uint8)
    shape = canvas.copy()
    cv2.fillPoly(shape, [contour], 1)
    cv2.ellipse(canvas, fitted, 1, -1)
    union = np.logical_or(canvas, shape).sum()
    return fitted if union and np.logical_and(canvas, shape).sum() / union >= ELLIPSE_MATCH else ()


def shape_from_mask(mask, lab, minimum_area):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    shapes = []
    for index, contour in enumerate(contours):
        outer = hierarchy[0][index][3] < 0
        if outer and cv2.contourArea(contour) >= minimum_area:
            holes = [c[:, 0, :].astype(np.float64) for j, c in enumerate(contours) if hierarchy[0][j][3] == index]
            ellipse = ellipse_of(contour) if not holes else ()
            shapes.append(SmoothShape(lab, (contour[:, 0, :].astype(np.float64), *holes), ellipse))
    return shapes


def smoothed_partition(labels, count, region, sigma):
    scores = np.stack([cv2.GaussianBlur((labels == index).astype(np.float32), (0, 0), sigma) for index in range(count)])
    partition = scores.argmax(axis=0)
    partition[~region] = -1
    return partition


def vectorize_component(patch, component, cell_px):
    lab = to_lab(patch.colour)
    region = cell_mask_pixels(ndimage.binary_dilation(component, iterations=DILATE_CELLS), (lab.shape[1], lab.shape[0]))
    region &= patch.visible
    if region.sum() < 10:
        return None, []
    labels, centres = cluster_pixels(lab[region])
    counts = np.bincount(labels, minlength=len(centres))
    background = centres[int(counts.argmax())]
    label_image = np.full(region.shape, -1, dtype=np.int32)
    label_image[region] = labels
    partition = smoothed_partition(label_image, len(centres), region, max(1.0, cell_px * MASK_SIGMA_RATIO))
    shapes = []
    for index, centre in enumerate(centres):
        if np.linalg.norm(centre - background) < BACKGROUND_DISTANCE:
            continue
        mask = cv2.dilate((partition == index).astype(np.uint8), np.ones((3, 3), np.uint8))
        shapes.extend(shape_from_mask(mask, centre, MIN_AREA_RATIO * cell_px * cell_px))
    ordered = sorted(shapes, key=lambda shape: -cv2.contourArea(shape.outlines[0].astype(np.float32)))
    return background, ordered
