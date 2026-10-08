"""Feasibility probe: can Grounding DINO + SAM (both Apache-2.0) find the painted marks (eyes, nose, mouth, spots) on renders of the optimized model?

Usage: uv run --python 3.12 --with torch,transformers,pillow,numpy python scripts/stage-3/checks/marks_probe.py <views_dir> <output_png>
<views_dir> holds front/back/left/right/top/bottom.png (RGBA) as written by stage-2/experiments/blender/render_views.py.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor, SamModel, SamProcessor

DETECTOR = "IDEA-Research/grounding-dino-tiny"
SEGMENTER = "facebook/sam-vit-base"
QUERIES = "eye. nose. mouth. spot. stripe. whisker."
VIEWS = ["front", "back", "left", "right", "top", "bottom"]
BOX_THRESHOLD, TEXT_THRESHOLD = 0.25, 0.2
BACKGROUND = (229, 229, 229)


def flatten(path: Path) -> Image.Image:
    view = Image.open(path).convert("RGBA")
    canvas = Image.new("RGB", view.size, BACKGROUND)
    canvas.paste(view, mask=view.split()[3])
    return canvas


def detect(processor, model, image: Image.Image) -> dict:
    inputs = processor(images=image, text=QUERIES, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    try:
        return processor.post_process_grounded_object_detection(
            outputs, inputs.input_ids, threshold=BOX_THRESHOLD, text_threshold=TEXT_THRESHOLD,
            target_sizes=[image.size[::-1]],
        )[0]
    except TypeError:
        return processor.post_process_grounded_object_detection(
            outputs, inputs.input_ids, box_threshold=BOX_THRESHOLD, text_threshold=TEXT_THRESHOLD,
            target_sizes=[image.size[::-1]],
        )[0]


def segment(processor, model, image: Image.Image, boxes: list) -> np.ndarray:
    if not boxes:
        return np.zeros((0, image.size[1], image.size[0]), dtype=bool)
    inputs = processor(image, input_boxes=[boxes], return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs, multimask_output=False)
    masks = processor.image_processor.post_process_masks(
        outputs.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu()
    )[0]
    return masks[:, 0].numpy()


def overlay(image: Image.Image, masks: np.ndarray, boxes: list, labels: list) -> Image.Image:
    tint = np.asarray(image, dtype=np.float32).copy()
    for mask in masks:
        tint[mask] = tint[mask] * 0.4 + np.array([255, 0, 255]) * 0.6
    result = Image.fromarray(tint.astype(np.uint8))
    draw = ImageDraw.Draw(result)
    for box, label in zip(boxes, labels):
        draw.rectangle(box, outline=(0, 160, 255), width=2)
        draw.text((box[0] + 3, box[1] + 3), str(label), fill=(0, 0, 0))
    return result


def main() -> None:
    views_dir, output = Path(sys.argv[1]), Path(sys.argv[2])
    detector_processor = AutoProcessor.from_pretrained(DETECTOR)
    detector = AutoModelForZeroShotObjectDetection.from_pretrained(DETECTOR).eval()
    segmenter_processor = SamProcessor.from_pretrained(SEGMENTER)
    segmenter = SamModel.from_pretrained(SEGMENTER).eval()
    cells = []
    for name in VIEWS:
        image = flatten(views_dir / f"{name}.png")
        found = detect(detector_processor, detector, image)
        boxes = [[round(float(v), 1) for v in box] for box in found["boxes"]]
        labels = found.get("text_labels", found.get("labels", []))
        masks = segment(segmenter_processor, segmenter, image, boxes)
        print(f"{name}: {len(boxes)} marks {list(labels)}")
        cells.append(overlay(image, masks, boxes, labels))
    width, height = cells[0].size
    sheet = Image.new("RGB", (width * 3, height * 2), BACKGROUND)
    for index, cell in enumerate(cells):
        sheet.paste(cell, ((index % 3) * width, (index // 3) * height))
    sheet.save(output)


if __name__ == "__main__":
    main()
