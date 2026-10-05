import cv2
import numpy as np
from scipy import ndimage

WHITE_DISTANCE = 28
MASK_BLUR_PX = 5
ECC_ITERATIONS = 80
ECC_EPSILON = 1e-5
MATCH_SIZE = 512


def split_sheet(sheet, columns, rows):
    height, width = sheet.shape[0] // rows, sheet.shape[1] // columns
    return [sheet[row * height:(row + 1) * height, column * width:(column + 1) * width]
            for row in range(rows) for column in range(columns)]


def foreground_mask(image):
    return np.abs(image.astype(np.int16) - 255).max(axis=2) > WHITE_DISTANCE


def overlap_ratio(first, second):
    union = np.logical_or(first, second).sum()
    return float(np.logical_and(first, second).sum() / union) if union else 0.0


def align_to(candidate, target_mask):
    mask = foreground_mask(candidate)
    blur = lambda value: cv2.GaussianBlur(value.astype(np.float32), (0, 0), MASK_BLUR_PX)
    transform = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, ECC_ITERATIONS, ECC_EPSILON)
    try:
        _, transform = cv2.findTransformECC(blur(target_mask), blur(mask), transform, cv2.MOTION_AFFINE, criteria, None, 5)
    except cv2.error:
        return candidate
    size = (candidate.shape[1], candidate.shape[0])
    return cv2.warpAffine(candidate, transform, size, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))


def fill_missing(image, wanted):
    present = foreground_mask(image)
    _, nearest = ndimage.distance_transform_edt(~present, return_indices=True)
    filled = image[nearest[0], nearest[1]]
    result = image.copy()
    gap = wanted & ~present
    result[gap] = filled[gap]
    return result


def best_candidate(cells, target_mask):
    scored = []
    for index, cell in enumerate(cells):
        resized = cv2.resize(cell, (MATCH_SIZE, MATCH_SIZE), interpolation=cv2.INTER_AREA)
        aligned = align_to(resized, target_mask)
        scored.append((overlap_ratio(foreground_mask(aligned), target_mask), index, aligned))
    return max(scored, key=lambda item: item[0])


def redrawn_view(original, sheet, columns, rows):
    alpha = original[:, :, 3] if original.shape[2] == 4 else np.full(original.shape[:2], 255, np.uint8)
    target = cv2.resize(alpha, (MATCH_SIZE, MATCH_SIZE), interpolation=cv2.INTER_AREA) > 127
    score, index, aligned = best_candidate(split_sheet(sheet, columns, rows), target)
    completed = fill_missing(aligned, target)
    size = (original.shape[1], original.shape[0])
    colour = cv2.resize(completed, size, interpolation=cv2.INTER_CUBIC)
    return np.dstack([colour, alpha]), index, score
