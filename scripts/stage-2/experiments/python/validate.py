"""Checks that make the step fail loudly instead of delivering a bad model: the geometry must not change and the
colours must stay faithful in hue. Softer findings are reported as warnings."""
import colorsys
import io
from pathlib import Path

import numpy as np
from glb_io import Glb, colour_image_bytes, geometry_signature, triangle_uvs
from PIL import Image
from uv_coverage import uv_coverage

HUE_SATURATION_FLOOR = 0.25
HUE_VALUE_FLOOR = 0.15
HUE_BINS = 12


class ValidationError(RuntimeError):
    pass


def check_structure(base: Glb, optimised: Glb, atlas_size: tuple[int, int]) -> None:
    if geometry_signature(base) != geometry_signature(optimised):
        raise ValidationError("The geometry of the optimised model differs from the base model")
    image = Image.open(io.BytesIO(colour_image_bytes(optimised)))
    if image.size != atlas_size:
        raise ValidationError(f"The optimised texture is {image.size}, expected {atlas_size}")
    width, height = image.size
    if not np.array_equal(uv_coverage(triangle_uvs(base), width, height), uv_coverage(triangle_uvs(optimised), width, height)):
        raise ValidationError("The UV layout of the optimised model differs from the base model")


def check_image(image: np.ndarray, atlas_size: tuple[int, int]) -> None:
    if image.shape[1::-1] != atlas_size:
        raise ValidationError(f"The texture is {image.shape[1::-1]}, expected {atlas_size}")
    if not np.isfinite(image).all():
        raise ValidationError("The texture has invalid pixels")


def hue_and_strength(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    hsv = np.array([colorsys.rgb_to_hsv(*pixel) for pixel in rgb[:: max(len(rgb) // 20000, 1)] / 255.0])
    colourful = (hsv[:, 1] >= HUE_SATURATION_FLOOR) & (hsv[:, 2] >= HUE_VALUE_FLOOR)
    return hsv[colourful, 0] * 360.0, colourful


def hue_shift(base: np.ndarray, optimised: np.ndarray, used: np.ndarray) -> float:
    """Mean hue change, in degrees, of the texels that are colourful both before and after."""
    pixels = np.flatnonzero(used.reshape(-1))[:: max(int(used.sum()) // 20000, 1)]
    before, after = base.reshape(-1, 3)[pixels] / 255.0, optimised.reshape(-1, 3)[pixels] / 255.0
    before_hsv = np.array([colorsys.rgb_to_hsv(*p) for p in before])
    after_hsv = np.array([colorsys.rgb_to_hsv(*p) for p in after])
    both = (before_hsv[:, 1] >= HUE_SATURATION_FLOOR) & (after_hsv[:, 1] >= HUE_SATURATION_FLOOR)
    both &= (before_hsv[:, 2] >= HUE_VALUE_FLOOR) & (after_hsv[:, 2] >= HUE_VALUE_FLOOR)
    if not both.any():
        return 0.0
    gap = np.abs(before_hsv[both, 0] - after_hsv[both, 0]) * 360.0
    return float(np.minimum(gap, 360.0 - gap).mean())


def hue_histogram(rgb: np.ndarray) -> np.ndarray:
    hues, _ = hue_and_strength(rgb)
    counts = np.bincount((hues // (360.0 / HUE_BINS)).astype(int) % HUE_BINS, minlength=HUE_BINS)
    return counts / max(counts.sum(), 1)


def art_hue_findings(art_cutout: Path, optimised: np.ndarray, used: np.ndarray, limits: dict) -> list[str]:
    """Warnings when a hue that matters in the art is missing from the texture, or the other way round."""
    if not art_cutout.exists():
        return []
    art = np.asarray(Image.open(art_cutout).convert("RGBA"))
    art_hues = hue_histogram(art[art[..., 3] > 200][:, :3])
    texture_hues = hue_histogram(optimised[used])
    findings = []
    for hue in range(HUE_BINS):
        near = [(hue + step) % HUE_BINS for step in (-1, 0, 1)]
        if art_hues[hue] >= limits["art_hue_share"] and texture_hues[near].sum() < limits["art_hue_share"] / 2:
            findings.append(f"hue {hue * 30} degrees is {art_hues[hue]:.0%} of the art but missing in the texture")
        if texture_hues[hue] >= limits["art_hue_share"] and art_hues[near].sum() < limits["art_hue_share"] / 2:
            findings.append(f"hue {hue * 30} degrees is {texture_hues[hue]:.0%} of the texture but not in the art")
    return findings
