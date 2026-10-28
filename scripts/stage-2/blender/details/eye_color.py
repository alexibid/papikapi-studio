"""Colour helpers shared by the image and the texture side: an eye is recognised by its iris colour."""
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ColorSignature:
    hue: float
    saturation: float
    value: float


def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Hue in degrees, saturation and value in 0..1 for an (..., 3) array."""
    high = rgb.max(axis=-1)
    low = rgb.min(axis=-1)
    chroma = high - low
    saturation = np.where(high > 0, chroma / np.maximum(high, 1e-6), 0.0)
    safe = np.maximum(chroma, 1e-6)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(high == red, ((green - blue) / safe) % 6,
                   np.where(high == green, (blue - red) / safe + 2, (red - green) / safe + 4)) * 60.0
    return np.where(chroma > 0, hue, 0.0), saturation, high


def matches(rgb: np.ndarray, signature: ColorSignature, settings: dict) -> np.ndarray:
    """True where a colour is an iris colour: saturated, bright enough and of the iris hue."""
    hue, saturation, value = hsv(rgb)
    hue_gap = np.abs((hue - signature.hue + 180) % 360 - 180)
    return (saturation >= settings["saturation_min"]) & (value >= settings["value_min"]) & (hue_gap <= settings["hue_tolerance_deg"])
