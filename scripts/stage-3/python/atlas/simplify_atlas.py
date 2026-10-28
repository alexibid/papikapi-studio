"""s3-step-1 (texture): simplifies the baked atlas of the simplified figure.

python simplify_atlas.py -- '{"input_png", "uv_json", "output_png", ...parameters}'
Every texel takes the flat colour of its colour family (same family merged, contrasting colours kept apart),
grain and specks join the surrounding family, details (rare colours and what they enclose) keep their baked
colours, borders are softened by one texel and colours bleed past each face.
"""
import json
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from atlas_details import detail_zone, keep_baked, lost_colour, rare_families, soften_borders
from atlas_islands import bleed, fill_missed, island_map
from atlas_labels import absorb_specks, family_labels, smooth_borders
from color_space import lab_to_srgb, lch_of, srgb_to_lab, to_hex
from config import VectorizeConfig
from palette import Palette

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
SAMPLE_LIMIT = 400_000


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def load_rgba(path: str) -> tuple:
    pixels = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float64) / 255.0
    return pixels[..., :3], pixels[..., 3] > 0.5


def build_palette(rgb: np.ndarray, covered: np.ndarray, settings: dict) -> Palette:
    samples = rgb[covered]
    step = max(1, len(samples) // SAMPLE_LIMIT)
    config = VectorizeConfig.create(rgb.shape[0], neutral_chroma=settings["neutral_chroma"],
                                    neutral_l_tolerance=settings["neutral_lightness_tolerance"])
    palette = Palette(samples[::step], config)
    palette.prune_transitions([(rgb, covered.astype(np.float64))])
    return palette


def family_colours(palette: Palette, labels: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """Flat colour of each family: the median of its own texels in Lab. The vectoriser's palette lifts light
    families towards white to remove shading, which turns a mid-grey body almost white on the atlas."""
    colours = palette.rgb.copy()
    for family in range(len(colours)):
        members = labels == family
        if members.any():
            colours[family] = lab_to_srgb(np.median(srgb_to_lab(rgb[members]), axis=0)[None, :])[0]
    return colours


def used_families(colours: np.ndarray, labels: np.ndarray, covered: np.ndarray) -> list:
    shares = [float((labels == index).sum() / covered.sum()) for index in range(len(colours))]
    return [{"hex": to_hex(colour), "share": round(share, 4)}
            for colour, share in zip(colours, shares) if round(share, 4) > 0]


def simplify(settings: dict) -> dict:
    rgb, reached = load_rgba(settings["input_png"])
    islands = island_map(settings["uv_json"], rgb.shape[0])
    covered = islands > 0
    rgb = fill_missed(rgb, reached & covered, islands)
    palette = build_palette(rgb, covered, settings)
    labels = family_labels(palette, rgb, covered)
    labels = smooth_borders(labels, covered, settings["border_smooth_sigma_px"])
    min_area = int(settings["speck_area_ratio"] * covered.sum())
    labels, absorbed, kept = absorb_specks(labels, palette.lab, min_area, settings["detail_contrast"])
    colours = family_colours(palette, labels, rgb)
    flat = np.zeros_like(rgb)
    flat[covered] = colours[labels[covered]]
    flat = soften_borders(flat, labels, islands, settings["border_soften_px"])
    rare = rare_families(labels, covered, settings["detail_share_max"])
    chroma = lch_of(srgb_to_lab(rgb.reshape(-1, 3)))[1].reshape(labels.shape)
    neutral = list(range(len(palette.neutral_seeds)))
    seeds = np.isin(labels, rare) | lost_colour(chroma, labels, neutral, 2 * settings["neutral_chroma"])
    zone = detail_zone(labels, islands, seeds, settings["detail_margin_px"])
    flat = keep_baked(flat, rgb, zone, settings["detail_denoise_px"])
    flat = bleed(flat, covered, settings["bleed_px"])
    alpha = np.where(covered | (flat.sum(axis=2) > 0), 255, 0).astype(np.uint8)
    image = np.dstack([np.clip(flat * 255.0 + 0.5, 0, 255).astype(np.uint8), alpha])
    Image.fromarray(image, "RGBA").save(settings["output_png"])
    return {
        "families": used_families(colours, labels, covered),
        "missedTexels": int((covered & ~reached).sum()),
        "specksAbsorbed": absorbed,
        "detailsKept": kept,
        "detailTexels": int(zone.sum()),
        "detailFamilies": [to_hex(colours[family]) for family in rare],
    }


if __name__ == "__main__":
    try:
        print(RESULT_MARKER + json.dumps(simplify(read_settings())))
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
