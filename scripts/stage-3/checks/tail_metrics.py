import json
import sys

import cv2
import numpy as np

THIN_RATIO = 0.30


def silhouette(path: str) -> np.ndarray:
    image = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return image[:, :, 3] > 40


def thin_run(profile: np.ndarray, height: int, from_end: bool) -> tuple[int, float]:
    values = profile[::-1] if from_end else profile
    values = values[np.nonzero(values > 0)[0][0]:]
    length = 0
    while length < len(values) and values[length] < THIN_RATIO * height:
        length += 1
    if length == 0:
        return 0, 0.0
    return length, float(np.median(values[:length]))


def tail_ratios(mask: np.ndarray) -> dict:
    rows, cols = np.nonzero(mask)
    height = rows.max() - rows.min() + 1
    profile = mask[:, cols.min():cols.max() + 1].sum(axis=0)
    candidates = [thin_run(profile, height, False), thin_run(profile, height, True)]
    length, thickness = max(candidates, key=lambda run: run[0])
    return {"protrusion": round(length / height, 3), "thickness": round(thickness / height, 3)}


def model_tail(paths: list[str]) -> dict:
    results = [tail_ratios(silhouette(path)) for path in paths]
    return max(results, key=lambda ratios: ratios["protrusion"])


if __name__ == "__main__":
    print(json.dumps(model_tail(sys.argv[1:])))
