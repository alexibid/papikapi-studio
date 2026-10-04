from typing import Dict, List
import numpy as np
from bezier import bezier_polyline
from PIL import Image, ImageChops, ImageDraw


def evenodd_mask(loops: List[np.ndarray], size: int, raster_scale: int, tension: float = 0.2, stroke_width: float = 0.0) -> Image.Image:
    mask = Image.new("1", (size * raster_scale, size * raster_scale), 0)
    for knots in loops:
        layer = Image.new("1", mask.size, 0)
        poly = [tuple(p) for p in bezier_polyline(knots, tension) * raster_scale]
        ImageDraw.Draw(layer).polygon(poly, fill=1)
        mask = ImageChops.logical_xor(mask, layer)
    if stroke_width > 0:
        outline = Image.new("1", mask.size, 0)
        draw = ImageDraw.Draw(outline)
        width = max(1, int(round(stroke_width * raster_scale)))
        for knots in loops:
            poly = [tuple(p) for p in bezier_polyline(knots, tension) * raster_scale]
            draw.line(poly + [poly[0]], fill=1, width=width, joint="curve")
        mask = ImageChops.logical_or(mask, outline)
    return mask


def rasterize_svg_equivalent(palette, loops_per_family: Dict[int, List[np.ndarray]], size: int, base_family: int, raster_scale: int = 1, tension: float = 0.2, stroke_width: float = 0.0, overlay=None) -> Image.Image:
    base_rgb_tuple = tuple((palette.rgb[base_family] * 255.0 + 0.5).astype(int))
    raster = Image.new("RGB", (size * raster_scale, size * raster_scale), base_rgb_tuple)

    sorted_families = sorted(
        loops_per_family.keys(),
        key=lambda f: sum(len(k) for k in loops_per_family[f]),
        reverse=True,
    )

    for family in sorted_families:
        if family == base_family:
            continue
        loops = loops_per_family[family]
        if not loops:
            continue
        color_rgb_tuple = tuple((palette.rgb[family] * 255.0 + 0.5).astype(int))
        mask = evenodd_mask(loops, size, raster_scale, tension, stroke_width)
        raster.paste(color_rgb_tuple, mask=mask)

    if raster_scale > 1:
        raster = raster.resize((size, size), Image.Resampling.LANCZOS)
    if overlay is not None:
        raster = raster.convert("RGBA")
        raster.alpha_composite(overlay)
        raster = raster.convert("RGB")

    return raster
