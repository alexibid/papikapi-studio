import sys
from pathlib import Path

import cv2
import numpy as np

BACKGROUND = 229
TILE = 384
VIEWS = ("fit", "right", "back", "left")
ARTS = {"d": "input-with-plinth.png", "e": "input-with-plinth.png", "a": "input-with-plinth.png", "b": "input-no-plinth.png", "c": "input-grey-plinth.png"}


def flatten(image: np.ndarray) -> np.ndarray:
    if image.shape[2] == 3:
        return image
    alpha = image[:, :, 3:] / 255.0
    ground = np.full(image.shape[:2] + (3,), BACKGROUND, np.uint8)
    return (image[:, :, :3] * alpha + ground * (1 - alpha)).astype(np.uint8)


def square_tile(image: np.ndarray) -> np.ndarray:
    flat = flatten(image)
    side = max(flat.shape[:2])
    canvas = np.full((side, side, 3), BACKGROUND, np.uint8)
    top, left = (side - flat.shape[0]) // 2, (side - flat.shape[1]) // 2
    canvas[top:top + flat.shape[0], left:left + flat.shape[1]] = flat
    return cv2.resize(canvas, (TILE, TILE), interpolation=cv2.INTER_AREA)


def crop_to_figure(image: np.ndarray) -> np.ndarray:
    rows, cols = np.nonzero(image[:, :, 3] > 10)
    margin = 12
    return image[max(rows.min() - margin, 0):rows.max() + margin, max(cols.min() - margin, 0):cols.max() + margin]


def candidate_row(directory: Path, label: str, art: Path) -> np.ndarray:
    tiles = [square_tile(cv2.imread(str(art), cv2.IMREAD_UNCHANGED))]
    for view in VIEWS:
        render = cv2.imread(str(directory / "fit" / f"{label}-{view}.png"), cv2.IMREAD_UNCHANGED)
        tiles.append(square_tile(crop_to_figure(render)))
    row = np.hstack(tiles)
    cv2.putText(row, label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    return row


def main(directory: Path, labels: list[str]) -> None:
    for label in labels:
        art = directory / ARTS[label[0]]
        cv2.imwrite(str(directory / f"sheet-{label}.png"), candidate_row(directory, label, art))


main(Path(sys.argv[1]), sys.argv[2:])
