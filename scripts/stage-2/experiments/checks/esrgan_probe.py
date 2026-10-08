"""Probe: which upscaler gives the sharpest atlas without inventing texture? Crops and numbers, nothing is written to the model.

Usage: python esrgan_probe.py -- '{"textures_dir": "...", "output_dir": "...", "cache": "~/.cache/papikapi/realesrgan", "variants": ["x4plus", "anime6B"]}'
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "python"))

import numpy as np
from PIL import Image
from realesrgan import MODELS, SCALE, ensure_weights, load_model, pick_device, upscale
from scipy import ndimage

WINDOW = (48, 36)
CROPS = 3


def flat_zone_grain(image: np.ndarray, mask: np.ndarray) -> float:
    """High-pass noise on flat zones: texture an upscaler made up shows here."""
    grey = image.astype(np.float32).mean(axis=2)
    low = ndimage.gaussian_filter(grey, 2.0)
    slope = np.hypot(ndimage.sobel(low, 0), ndimage.sobel(low, 1))
    flat = ndimage.binary_erosion(mask & (slope < 2.0), iterations=4)
    return float((grey - low)[flat].std())


def sharpness(image: np.ndarray, mask: np.ndarray) -> tuple[float, float]:
    grey = image.astype(np.float32).mean(axis=2)
    inside = ndimage.binary_erosion(mask, iterations=6)
    slope = np.hypot(ndimage.sobel(grey, 0), ndimage.sobel(grey, 1)) / 8
    return float(ndimage.laplace(grey)[inside].var()), float(np.percentile(slope[inside], 99))


def busiest_windows(base: np.ndarray, mask: np.ndarray) -> list[tuple[int, int, int, int]]:
    """The windows of the used atlas with the most edge energy (eyes, nose, muzzle): where an upscaler shows its work."""
    grey = base.astype(np.float32).mean(axis=2)
    energy = ndimage.uniform_filter(np.hypot(ndimage.sobel(grey, 0), ndimage.sobel(grey, 1)) * mask, size=WINDOW[::-1])
    boxes = []
    for _ in range(CROPS):
        y, x = np.unravel_index(energy.argmax(), energy.shape)
        boxes.append((x - WINDOW[0] // 2, y - WINDOW[1] // 2, x + WINDOW[0] // 2, y + WINDOW[1] // 2))
        energy[max(y - 60, 0) : y + 60, max(x - 80, 0) : x + 80] = 0
    return boxes


if __name__ == "__main__":
    settings = json.loads(sys.argv[sys.argv.index("--") + 1])
    textures, output, cache = Path(settings["textures_dir"]), Path(settings["output_dir"]), Path(settings["cache"]).expanduser()
    output.mkdir(parents=True, exist_ok=True)
    base = np.asarray(Image.open(textures / "atlas-base.png").convert("RGB"))
    mask = np.asarray(Image.open(textures / "atlas-mask.png")) > 127
    device = pick_device()
    size = (base.shape[1] * SCALE, base.shape[0] * SCALE)
    results = {"lanczos x4": np.asarray(Image.fromarray(base).resize(size, Image.LANCZOS))}
    for variant in settings["variants"]:
        weights = ensure_weights(cache / Path(MODELS[variant]["url"]).name, variant)
        started = time.time()
        results[variant] = upscale(load_model(weights, device, variant), base, device)
        print(f"{variant}: {time.time() - started:.1f}s on {device}", flush=True)
        Image.fromarray(results[variant]).save(output / f"atlas-{variant}.png")
    big_mask = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize(size, Image.NEAREST)) > 127
    print(f"  {'':12} {'laplacian var':>14} {'edge slope p99':>15} {'flat-zone grain':>16}")
    for name, image in results.items():
        laplacian, slope = sharpness(image, big_mask)
        print(f"  {name:12} {laplacian:14.1f} {slope:15.1f} {flat_zone_grain(image, big_mask):16.2f}")
    rows = [np.concatenate([np.asarray(Image.fromarray(image).crop(tuple(v * SCALE for v in box)).resize((480, 360), Image.NEAREST)) for image in results.values()], axis=1) for box in busiest_windows(base, mask)]
    Image.fromarray(np.concatenate(rows, axis=0)).save(output / "crops.png")
