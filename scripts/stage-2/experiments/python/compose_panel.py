"""Six-view panel: the base model on top, the optimised one below, the original art on the right."""
import json
import sys
import traceback
from pathlib import Path

from PIL import Image, ImageDraw

VIEWS = ("front", "back", "left", "right", "top", "bottom")
BACKDROP = (229, 229, 229)
LABEL_HEIGHT = 30


def on_backdrop(path: Path, size: int) -> Image.Image:
    view = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", view.size, BACKDROP + (255,))
    canvas.alpha_composite(view)
    return canvas.convert("RGB")


def compose(settings: dict) -> dict:
    size = int(settings["cell"])
    rows = [("step-3-base.glb", Path(settings["before_dir"])), ("step-4-optimize.glb", Path(settings["after_dir"]))]
    panel = Image.new("RGB", (size * (len(VIEWS) + 1), (size + LABEL_HEIGHT) * len(rows)), BACKDROP)
    draw = ImageDraw.Draw(panel)
    for row, (title, directory) in enumerate(rows):
        top = row * (size + LABEL_HEIGHT)
        draw.text((10, top + 9), title, fill=(40, 40, 40))
        for column, name in enumerate(VIEWS):
            panel.paste(on_backdrop(directory / f"{name}.png", size), (column * size, top + LABEL_HEIGHT))
    art = Image.open(settings["art"]).convert("RGB").resize((size, size), Image.LANCZOS)
    panel.paste(art, (len(VIEWS) * size, LABEL_HEIGHT))
    panel.save(settings["panel_path"])
    return {"panel": settings["panel_path"]}


if __name__ == "__main__":
    try:
        print("PAPERCRAFT_RESULT " + json.dumps(compose(json.loads(sys.argv[sys.argv.index("--") + 1]))))
    except Exception as error:
        traceback.print_exc()
        print("PAPERCRAFT_ERROR " + json.dumps(f"{type(error).__name__}: {error}"))
        sys.exit(1)
