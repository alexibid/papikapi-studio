import sys

import cv2
import numpy as np

BACK_PROJECTION_PASSES = 6
BILATERAL = (7, 14, 5)
SHARPEN_AMOUNT = 0.55
SHARPEN_SIGMA = 1.6
ALPHA_SMOOTH_SIGMA = 1.2


def spread_colour_beyond_alpha(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    known = (alpha > 8).astype(np.uint8)
    spread = rgb.copy()
    for radius in (1, 2, 4, 8, 16):
        blurred = cv2.blur(spread * known[:, :, None], (2 * radius + 1, 2 * radius + 1))
        weight = cv2.blur(known.astype(np.float32), (2 * radius + 1, 2 * radius + 1))[:, :, None]
        filled = blurred / np.maximum(weight, 1e-4)
        spread = np.where(known[:, :, None] > 0, spread, filled)
        known = np.maximum(known, (weight[:, :, 0] > 0.02).astype(np.uint8))
    return spread


def back_project(source: np.ndarray, target_size: tuple[int, int]) -> np.ndarray:
    estimate = cv2.resize(source, target_size, interpolation=cv2.INTER_LANCZOS4)
    for _ in range(BACK_PROJECTION_PASSES):
        reduced = cv2.resize(estimate, (source.shape[1], source.shape[0]), interpolation=cv2.INTER_AREA)
        residual = source - reduced
        estimate = estimate + cv2.resize(residual, target_size, interpolation=cv2.INTER_CUBIC)
    return np.clip(estimate, 0, 255)


def sharpen(image: np.ndarray, factor: int) -> np.ndarray:
    blurred = cv2.GaussianBlur(image, (0, 0), SHARPEN_SIGMA * factor / 2)
    return np.clip(image + SHARPEN_AMOUNT * (image - blurred), 0, 255)


def smooth_alpha(alpha: np.ndarray, target_size: tuple[int, int]) -> np.ndarray:
    large = cv2.resize(alpha.astype(np.float32), target_size, interpolation=cv2.INTER_CUBIC)
    large = cv2.GaussianBlur(large, (0, 0), ALPHA_SMOOTH_SIGMA)
    ramp = np.clip((large / 255.0 - 0.5) * 6.0 + 0.5, 0, 1)
    return ramp * 255.0


def upscale(path: str, factor: int, output: str) -> float:
    image = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    rgb = spread_colour_beyond_alpha(image[:, :, :3].astype(np.float32), image[:, :, 3])
    size = (image.shape[1] * factor, image.shape[0] * factor)
    large = back_project(rgb, size)
    large = cv2.bilateralFilter(large.astype(np.float32), *BILATERAL)
    large = sharpen(large, factor)
    alpha = smooth_alpha(image[:, :, 3], size)
    cv2.imwrite(output, np.dstack([np.clip(large, 0, 255), alpha]).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    returned = cv2.resize(large, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_AREA)
    mask = image[:, :, 3] > 200
    return float(np.abs(returned[mask] - image[:, :, :3][mask]).mean())


print(upscale(sys.argv[1], int(sys.argv[2]), sys.argv[3]))
