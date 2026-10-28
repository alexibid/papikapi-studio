import sys

import cv2
import numpy as np

BOTTOM_START_RATIO = 0.55
HUE_RANGE = (2, 40)
MIN_SATURATION = 40
MIN_VALUE = 50


def recolour_plinth(source: str, target: str) -> int:
    image = cv2.imread(source, cv2.IMREAD_UNCHANGED)
    hsv = cv2.cvtColor(image[:, :, :3], cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    mask = (hue >= HUE_RANGE[0]) & (hue <= HUE_RANGE[1]) & (saturation >= MIN_SATURATION) & (value >= MIN_VALUE)
    mask &= image[:, :, 3] > 20
    mask[: int(image.shape[0] * BOTTOM_START_RATIO), :] = False
    image[mask, 0] = image[mask, 1] = image[mask, 2] = value[mask]
    cv2.imwrite(target, image)
    return int(mask.sum())


print(recolour_plinth(sys.argv[1], sys.argv[2]))
