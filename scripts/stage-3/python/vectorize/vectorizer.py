import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import cleanup2
from lines import ink_line_mask
from texture import texture_layer
from cleanup import (
    drop_tints_on_base,
    smooth_labels,
)
from color_space import to_hex
from config import VectorizeConfig
from contours import extract_family_loops
from labeling import label_view, load_view, sampled_views
from palette import Palette
from raster_writer import rasterize_svg_equivalent
from svg_writer import write_svg

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings() -> dict:
    if "--" in sys.argv:
        return json.loads(sys.argv[sys.argv.index("--") + 1])
    return {
        "views_dir": sys.argv[1] if len(sys.argv) > 1 else "",
        "output_dir": sys.argv[2] if len(sys.argv) > 2 else "",
        "resolution": int(sys.argv[3]) if len(sys.argv) > 3 else 2048,
    }


def execute_vectorization(views_dir: str, output_dir: str, resolution: int = 2048) -> dict:
    config = VectorizeConfig.create(resolution=resolution)
    os.makedirs(output_dir, exist_ok=True)

    reduced_views = list(sampled_views(views_dir, config.view_names))
    if not reduced_views:
        raise RuntimeError(f"No views found in {views_dir}")

    all_opaque_rgb = np.concatenate([rgb[alpha >= 0.5] for rgb, alpha in reduced_views])
    palette = Palette(all_opaque_rgb, config)
    palette.prune_transitions(reduced_views)
    del reduced_views

    family_count = len(palette.rgb)
    base_family = palette.base
    neutral_count = len(palette.neutral_seeds)

    total_paths = 0
    total_nodes = 0
    view_metrics = {}

    for name in config.view_names:
        rgb, alpha = load_view(views_dir, name)
        size = rgb.shape[0]

        factor = size / 1024.0
        raw_labels = label_view(rgb, alpha, palette, config).copy()
        dark_family = int(np.argmin(palette.lab[:neutral_count, 0]))
        raw_labels[ink_line_mask(rgb, alpha, factor, 3.5, 14.0, 68.0)] = dark_family
        cleaned_labels = cleanup2.remove_small_regions_keep_thin(
            raw_labels, family_count, config.min_region_px, 24 * factor, 3.5 * factor)
        tintless_labels = drop_tints_on_base(cleaned_labels, family_count, base_family, neutral_count, config)
        opened_labels = cleanup2.open_features_keep_thin(
            tintless_labels, family_count, base_family, config.open_radius_px, 24 * factor, 3.5 * factor)
        smoothed_labels = smooth_labels(opened_labels, family_count, config)

        loops_per_family = {}
        for family in range(family_count):
            if family == base_family:
                continue
            loops = extract_family_loops(smoothed_labels, family, config)
            if loops:
                loops_per_family[family] = loops

        texture_paths, texture_nodes, texture_raster = texture_layer(rgb, alpha, config, palette.rgb[base_family])
        svg_content, path_count, node_count = write_svg(
            palette, loops_per_family, size, base_family, config.tension,
            config.stroke_width_px, texture_paths
        )
        path_count += len(texture_paths)
        node_count += texture_nodes
        total_paths += path_count
        total_nodes += node_count

        svg_path = os.path.join(output_dir, f"{name}.svg")
        with open(svg_path, "w") as handle:
            handle.write(svg_content)

        raster = rasterize_svg_equivalent(
            palette, loops_per_family, size, base_family, config.raster_scale, config.tension,
            config.stroke_width_px, texture_raster
        )
        raster_path = os.path.join(output_dir, f"flat_{name}.png")
        raster.save(raster_path)

        view_metrics[name] = {"paths": path_count, "nodes": node_count, "size": size}

    palette_data = palette.describe()
    with open(os.path.join(output_dir, "palette.json"), "w") as handle:
        json.dump(palette_data, handle, indent=2)

    return {
        "viewsCount": len(config.view_names),
        "familiesCount": family_count,
        "baseHex": to_hex(palette.rgb[base_family]),
        "totalPaths": total_paths,
        "totalNodes": total_nodes,
        "views": view_metrics,
        "palette": palette_data,
    }


def main():
    settings = read_settings()
    views_dir = settings["views_dir"]
    output_dir = settings.get("output_dir") or os.path.join(views_dir, "svg")
    resolution = int(settings.get("resolution", 2048))

    result = execute_vectorization(views_dir, output_dir, resolution)
    print(RESULT_MARKER + json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
