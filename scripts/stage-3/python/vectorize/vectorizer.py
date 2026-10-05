import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
from color_space import to_hex
from config import VectorizeConfig
from palette import Palette
from PIL import Image
from texture import texture_layer

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
SAMPLE_STEP = 4


def read_settings() -> dict:
    if "--" in sys.argv:
        return json.loads(sys.argv[sys.argv.index("--") + 1])
    return {
        "views_dir": sys.argv[1] if len(sys.argv) > 1 else "",
        "facets_dir": sys.argv[2] if len(sys.argv) > 2 else "",
        "output_dir": sys.argv[3] if len(sys.argv) > 3 else "",
        "resolution": int(sys.argv[4]) if len(sys.argv) > 4 else 2048,
    }


def load_view(directory: str, name: str):
    image = np.asarray(Image.open(os.path.join(directory, f"{name}.png")).convert("RGBA"), dtype=np.float32) / 255.0
    return image[:, :, :3].astype(np.float64), image[:, :, 3].astype(np.float64)


def facet_palette(facets_dir: str, config: VectorizeConfig) -> Palette:
    samples = []
    for name in config.view_names:
        rgb, alpha = load_view(facets_dir, name)
        samples.append(rgb[::SAMPLE_STEP, ::SAMPLE_STEP][alpha[::SAMPLE_STEP, ::SAMPLE_STEP] >= 0.5])
    return Palette(np.concatenate(samples), config)


def write_texture_svg(path: str, size: int, paths: list):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">']
    parts.extend(paths)
    parts.append("</svg>")
    with open(path, "w") as handle:
        handle.write("\n".join(parts))


def compose_flat_view(facet_rgb, facet_alpha, texture_raster: Image.Image, background) -> Image.Image:
    size = facet_alpha.shape[0]
    canvas = Image.new("RGBA", (size, size), tuple((np.asarray(background) * 255 + 0.5).astype(int)) + (255,))
    facets = np.dstack([facet_rgb, (facet_alpha >= 0.5).astype(np.float64)])
    canvas.alpha_composite(Image.fromarray((facets * 255 + 0.5).astype(np.uint8), "RGBA"))
    canvas.alpha_composite(texture_raster)
    return canvas.convert("RGB")


def execute_vectorization(views_dir: str, facets_dir: str, output_dir: str, resolution: int = 2048) -> dict:
    config = VectorizeConfig.create(resolution=resolution)
    os.makedirs(output_dir, exist_ok=True)
    palette = facet_palette(facets_dir, config)
    background = palette.rgb[palette.base]

    total_paths, total_nodes, view_metrics = 0, 0, {}
    for name in config.view_names:
        rgb, alpha = load_view(views_dir, name)
        facet_rgb, facet_alpha = load_view(facets_dir, name)
        paths, nodes, raster = texture_layer(rgb, alpha, facet_rgb, facet_alpha, config)
        write_texture_svg(os.path.join(output_dir, f"{name}.svg"), rgb.shape[0], paths)
        compose_flat_view(facet_rgb, facet_alpha, raster, background).save(os.path.join(output_dir, f"flat_{name}.png"))
        total_paths += len(paths)
        total_nodes += nodes
        view_metrics[name] = {"paths": len(paths), "nodes": nodes, "size": rgb.shape[0]}

    palette_data = palette.describe()
    with open(os.path.join(output_dir, "palette.json"), "w") as handle:
        json.dump(palette_data, handle, indent=2)

    return {
        "viewsCount": len(config.view_names),
        "familiesCount": len(palette.rgb),
        "baseHex": to_hex(background),
        "totalPaths": total_paths,
        "totalNodes": total_nodes,
        "views": view_metrics,
        "palette": palette_data,
    }


def main():
    settings = read_settings()
    views_dir = settings["views_dir"]
    output_dir = settings.get("output_dir") or os.path.join(views_dir, "svg")
    result = execute_vectorization(
        views_dir, settings["facets_dir"], output_dir, int(settings.get("resolution", 2048))
    )
    print(RESULT_MARKER + json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
