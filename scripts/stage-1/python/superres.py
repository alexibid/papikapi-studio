import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

ALPHA_FLOOR = 20


def run_model(binary: Path, model: str, scale: int, source: Path, target: Path) -> None:
    command = [str(binary), "-i", str(source), "-o", str(target), "-n", model, "-s", str(scale),
               "-m", str(binary.parent / "models")]
    outcome = subprocess.run(command, capture_output=True, text=True)
    if outcome.returncode != 0 or not target.exists():
        raise RuntimeError(f"Real-ESRGAN failed: {outcome.stderr[-400:]}")


def super_resolve(bgr: np.ndarray, binary: Path, model: str, scale: int) -> np.ndarray:
    with tempfile.TemporaryDirectory() as folder:
        source, target = Path(folder) / "in.png", Path(folder) / "out.png"
        cv2.imwrite(str(source), bgr)
        run_model(binary, model, scale, source, target)
        return cv2.imread(str(target), cv2.IMREAD_COLOR)


def fit_square(bgra: np.ndarray, side: int, margin_ratio: float) -> np.ndarray:
    ys, xs = np.nonzero(bgra[:, :, 3] > ALPHA_FLOOR)
    crop = bgra[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    scale = side * (1.0 - 2 * margin_ratio) / max(crop.shape[:2])
    size = (round(crop.shape[1] * scale), round(crop.shape[0] * scale))
    alpha = crop[:, :, 3:4].astype(np.float32) / 255.0
    premultiplied = cv2.resize(np.dstack([crop[:, :, :3] * alpha, alpha]), size, interpolation=cv2.INTER_AREA)
    coverage = premultiplied[:, :, 3:4]
    colour = np.where(coverage > 1e-3, premultiplied[:, :, :3] / np.maximum(coverage, 1e-3), 0)
    resized = np.dstack([np.clip(colour, 0, 255), coverage * 255]).astype(np.uint8)
    canvas = np.zeros((side, side, 4), np.uint8)
    top, left = (side - size[1]) // 2, (side - size[0]) // 2
    canvas[top:top + size[1], left:left + size[0]] = resized
    return canvas
