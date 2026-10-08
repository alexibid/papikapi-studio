"""Stage 2 / step 4 (experiment): Real-ESRGAN anime6B (trained on illustration), applied as it is.

The x4 upscaled atlas becomes the texture of the GLB and every other byte of the model stays as it was."""
import io
import json
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
from glb_io import colour_image_bytes, read_glb, replace_colour_image, triangle_uvs, write_glb
from PIL import Image
from realesrgan import SCALE, ensure_weights, load_model, pick_device, upscale
from uv_coverage import uv_coverage
from validate import art_hue_findings, check_image, check_structure, hue_shift


def png_bytes(image: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def upscale_atlas(atlas: np.ndarray, settings: dict) -> np.ndarray:
    """MPS first; if the device fails (memory, unsupported op) the same work runs on the CPU."""
    variant = settings["variant"]
    weights = ensure_weights(Path(settings["weights"]).expanduser(), variant)
    for device in dict.fromkeys([pick_device(), "cpu"]):
        try:
            return upscale(load_model(weights, device, variant), atlas, device, settings["tile"], settings["pad"])
        except RuntimeError:
            continue
    raise RuntimeError("Real-ESRGAN failed on every device")


def optimise(settings: dict) -> dict:
    started = time.time()
    base = read_glb(Path(settings["base_glb"]))
    atlas = np.asarray(Image.open(io.BytesIO(colour_image_bytes(base))).convert("RGB"))
    height, width = atlas.shape[:2]
    mask = uv_coverage(triangle_uvs(base), width, height)

    tick = time.time()
    texture = upscale_atlas(atlas, settings["realesrgan"])
    upscaled = time.time() - tick

    check_image(texture, (width * SCALE, height * SCALE))
    optimised = replace_colour_image(base, png_bytes(texture))
    check_structure(base, optimised, (width * SCALE, height * SCALE))
    write_glb(Path(settings["output_glb"]), optimised)

    textures = Path(settings["textures_dir"])
    textures.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(textures / "atlas-base.png")
    Image.fromarray(texture).save(textures / "atlas-optimized.png")
    Image.fromarray((mask * 255).astype(np.uint8)).save(textures / "atlas-mask.png")

    comparable = np.asarray(Image.fromarray(texture).resize((width, height), Image.LANCZOS))
    shift = hue_shift(atlas, comparable, mask)
    warnings = art_hue_findings(Path(settings["art_cutout"]), comparable, mask, settings["limits"])
    if shift > settings["limits"]["max_hue_shift"]:
        warnings.append(f"mean hue shift {shift:.1f} degrees against the base texture")
    return {
        "atlas": [width, height],
        "texture": [texture.shape[1], texture.shape[0]],
        "usedShare": round(float(mask.mean()), 4),
        "hueShiftDegrees": round(shift, 2),
        "warnings": warnings,
        "seconds": {"realesrgan": round(upscaled, 1), "total": round(time.time() - started, 1)},
    }


if __name__ == "__main__":
    try:
        print("PAPERCRAFT_RESULT " + json.dumps(optimise(json.loads(sys.argv[sys.argv.index("--") + 1]))))
    except Exception as error:
        traceback.print_exc()
        print("PAPERCRAFT_ERROR " + json.dumps(f"{type(error).__name__}: {error}"))
        sys.exit(1)
